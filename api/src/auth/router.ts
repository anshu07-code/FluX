import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiKeyError, AuthError, getJwtSecret, resolveAuthUser } from "../development-user.js";
import { getSmtpTransporter, isSmtpConfigured, smtpFromAddress } from "../mail.js";
import {
  DEFAULT_PREFERENCES,
  PreferencesError,
  parsePreferences,
  validatePreferencesUpdate,
} from "../preferences.js";

const router = Router();

/** Password-reset tokens are valid for 30 minutes and can be used once. */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Only the SHA-256 hash of a reset token is stored, so a DB leak cannot be replayed. */
function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = (req.body ?? {}) as { name?: unknown; email?: unknown; password?: unknown };
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const displayName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null;
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: email.trim(), name: displayName, password: hashedPassword, provider: "email" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // Log activity
    await prisma.activityLog.create({
      data: { userId: user.id, action: "REGISTER", resource: "user", resourceId: user.id },
    });

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: "7d" });
    return res.status(201).json({ user, token });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Unable to register." });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Log activity
    await prisma.activityLog.create({
      data: { userId: user.id, action: "LOGIN", resource: "user", resourceId: user.id },
    });

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: "7d" });
    return res.json({
      user: { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Unable to log in." });
  }
});

// Forgot password — start a reset. The response is identical whether or not
// the account exists (no user enumeration). The emailed link carries a
// random token; only its SHA-256 hash is persisted, single-use, 30-minute TTL.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = (req.body ?? {}) as { email?: unknown };
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    // Fail loud in production when email cannot actually be sent; in
    // development the reset link is logged so the flow stays testable.
    if (!isSmtpConfigured() && process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "Password reset email is not configured on the server (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).",
      });
    }

    const normalized = email.trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    // OAuth-only accounts have no password to reset; treat them like unknown
    // emails so the response never reveals which accounts exist.
    if (user && user.password) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashResetToken(token),
          passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      const text = [
        `Hi ${user.name ?? user.email},`,
        "",
        "Someone requested a password reset for your FluX account.",
        `Reset your password here (valid for 30 minutes): ${resetUrl}`,
        "",
        "If you did not request this, you can safely ignore this email — your password has not changed.",
      ].join("\n");
      const html = `
        <p>Hi ${user.name ?? user.email},</p>
        <p>Someone requested a password reset for your <strong>FluX</strong> account.</p>
        <p><a href="${resetUrl}">Reset your password</a> (valid for 30 minutes).</p>
        <p>If you did not request this, you can safely ignore this email — your password has not changed.</p>
      `;

      const transporter = getSmtpTransporter();
      if (transporter) {
        try {
          await transporter.sendMail({
            from: smtpFromAddress(),
            to: normalized,
            subject: "Reset your FluX password",
            text,
            html,
          });
        } catch (error) {
          console.error("Password reset email failed:", error);
          return res.status(500).json({ error: "Could not send the reset email. Please try again." });
        }
      } else {
        console.log(`[auth] Password reset (dev — SMTP not configured): ${resetUrl}`);
      }

      await prisma.activityLog.create({
        data: { userId: user.id, action: "PASSWORD_RESET_REQUESTED", resource: "user", resourceId: user.id },
      });
    }

    return res.json({ message: "If an account exists for that email, a password reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Could not start the password reset. Please try again." });
  }
});

// Reset password — consume the emailed token and set a new password.
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = (req.body ?? {}) as { token?: unknown; password?: unknown };
    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ error: "Reset token is required." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const user = await prisma.user.findFirst({
      where: { passwordResetToken: hashResetToken(token.trim()), passwordResetExpires: { gt: new Date() } },
    });
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, passwordResetToken: null, passwordResetExpires: null },
    });
    // Invalidate server-side sessions so the reset applies to existing
    // sessions too. (Stateless JWTs issued earlier cannot be revoked.)
    await prisma.session.deleteMany({ where: { userId: user.id } });

    await prisma.activityLog.create({
      data: { userId: user.id, action: "PASSWORD_RESET", resource: "user", resourceId: user.id },
    });

    return res.json({ message: "Password has been reset. You can now sign in." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Could not reset the password. Please try again." });
  }
});

// OAuth login/register — the ONLY acceptable proof of identity is a Google
// ID token verified against Google's token endpoint. The previous version
// trusted an email from the request body, which let anyone mint a JWT for any
// account; that hole is closed.
router.post("/oauth", async (req, res) => {
  try {
    // req.body is undefined when the request has no JSON payload — never destructure it raw.
    const { idToken, provider, name, image } = (req.body ?? {}) as {
      idToken?: unknown;
      provider?: unknown;
      name?: unknown;
      image?: unknown;
    };

    if (provider !== "google") {
      return res.status(400).json({ error: 'Unsupported OAuth provider. Only "google" is supported.' });
    }
    if (typeof idToken !== "string" || idToken.trim().length === 0) {
      return res.status(400).json({ error: "Missing Google ID token." });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      return res.status(503).json({
        error:
          "Google sign-in is not configured on the API. Set GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET) in the server .env.",
      });
    }

    // Verify the token with Google (signature, expiry, audience are all checked).
    let payload: Record<string, unknown>;
    try {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const verifyRes = await fetch(verifyUrl, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (!verifyRes.ok) {
        return res.status(401).json({ error: "Google rejected the ID token (signature expired or invalid)." });
      }
      payload = (await verifyRes.json()) as Record<string, unknown>;
    } catch (error) {
      console.error("Google token verification failed:", error);
      return res.status(502).json({ error: "Could not verify the Google ID token. Sign-in aborted." });
    }

    const audience = payload.aud;
    const audienceOk =
      audience === clientId || (Array.isArray(audience) && audience.includes(clientId));
    if (!audienceOk) {
      return res.status(401).json({ error: "Google ID token was issued for a different application." });
    }

    const email = typeof payload.email === "string" ? payload.email : null;
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!email || !emailVerified) {
      return res.status(401).json({ error: "Google account email is missing or unverified." });
    }

    const subject = typeof payload.sub === "string" ? payload.sub : null;
    if (!subject) {
      return res.status(401).json({ error: "Google ID token is missing a subject." });
    }

    const displayName =
      (typeof name === "string" && name.trim()) ||
      (typeof payload.name === "string" && payload.name) ||
      email;
    const avatar =
      (typeof image === "string" && image) ||
      (typeof payload.picture === "string" && payload.picture) ||
      null;

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Update user info
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: displayName, image: avatar, provider: "google", providerId: subject },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: { email, name: displayName, image: avatar, provider: "google", providerId: subject },
      });

      // Log activity
      await prisma.activityLog.create({
        data: { userId: user.id, action: "REGISTER", resource: "user", resourceId: user.id },
      });
    }

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: "7d" });
    return res.json({
      user: { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role },
      token,
    });
  } catch (error) {
    console.error("OAuth error:", error);
    return res.status(500).json({ error: "OAuth sync failed." });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, image: true, role: true, provider: true, createdAt: true },
    });

    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ user });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to get user." });
  }
});

// Update current user profile
router.put("/me", async (req, res) => {
  try {
    const { name, email, image } = (req.body ?? {}) as { name?: string; email?: string; image?: string };

    // Resolve user from token — never trust userId from request body
    const { userId: targetUserId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.id !== targetUserId) {
        return res.status(400).json({ error: "Email already in use by another account." });
      }
      updateData.email = email;
    }
    if (image !== undefined) updateData.image = image;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update." });
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "PROFILE_UPDATE",
        resource: "user",
        resourceId: user.id,
        details: { updatedFields: Object.keys(updateData) },
      },
    });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, image: user.image },
    });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Profile update error:", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

// Read this account's notification preferences (server-side, cross-device).
router.get("/preferences", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ preferences: parsePreferences(user.preferences) });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Preferences read error:", error);
    return res.status(500).json({ error: "Failed to load preferences." });
  }
});

// Update notification preferences. Partial updates merge over current values;
// the webhook URL is validated (Slack-only HTTPS endpoint, no arbitrary URLs).
router.put("/preferences", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    let update: Partial<typeof DEFAULT_PREFERENCES>;
    try {
      update = validatePreferencesUpdate(req.body);
    } catch (error) {
      if (error instanceof PreferencesError) return res.status(400).json({ error: error.message });
      throw error;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    if (!user) return res.status(404).json({ error: "User not found." });
    const merged = { ...parsePreferences(user.preferences), ...update };

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as unknown as Prisma.InputJsonValue },
    });
    await prisma.activityLog.create({
      data: {
        userId,
        action: "PREFERENCES_UPDATE",
        resource: "user",
        resourceId: userId,
        details: { updatedFields: Object.keys(update) },
      },
    });

    return res.json({ preferences: merged });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Preferences update error:", error);
    return res.status(500).json({ error: "Failed to update preferences." });
  }
});

// Change password
router.put("/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }

    // Resolve user from token — never trust userId from request body
    const { userId: targetUserId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) return res.status(404).json({ error: "User not found." });

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password ?? "");
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { password: hashedPassword },
    });
    // A password change signs out every other server-side session so a stolen
    // cookie stops working immediately. (Stateless JWTs issued earlier cannot
    // be revoked — same limitation as reset-password.)
    await prisma.session.deleteMany({ where: { userId: targetUserId } });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: targetUserId,
        action: "PASSWORD_CHANGE",
        resource: "user",
        resourceId: targetUserId,
      },
    });

    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Password change error:", error);
    return res.status(500).json({ error: "Failed to change password." });
  }
});

// Permanently delete the authenticated account. Cascades through every
// relation (API keys, sessions, activity logs, workflows). Email/password
// accounts must re-verify their password so a stolen session cannot silently
// delete the account; OAuth accounts have no password, so the authenticated
// session is enough.
router.delete("/me", async (req, res) => {
  try {
    const { password } = (req.body ?? {}) as { password?: string };

    const auth = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);
    // Account deletion is destructive: never act on the shared development
    // fallback user, even in dev. A real API key or JWT is required.
    if (auth.kind === "dev") {
      return res.status(401).json({ error: "Sign in to delete your account." });
    }
    const targetUserId = auth.userId;

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: "Your password is required to delete this account." });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Password is incorrect." });
      }
    }

    // WorkflowExecution.workflow is onDelete: Restrict (execution history is
    // protected from accidental workflow deletion), so cascade from the user
    // alone would hit a foreign-key error for any user who has run a workflow.
    // Delete in dependency order instead: executions first (their node
    // executions + dead-letter events cascade), then workflows (nodes + edges
    // cascade), then the user (keys, sessions, accounts, activity cascade).
    await prisma.$transaction([
      prisma.workflowExecution.deleteMany({ where: { workflow: { userId: targetUserId } } }),
      prisma.workflow.deleteMany({ where: { userId: targetUserId } }),
      prisma.user.delete({ where: { id: targetUserId } }),
    ]);

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Account deletion error:", error);
    return res.status(500).json({ error: "Failed to delete account." });
  }
});

export default router;
