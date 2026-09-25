import { createHash } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import jwt from "jsonwebtoken";

const DEV_FALLBACK_SECRET = "flux-dev-secret-change-in-production";

/**
 * JWT signing/verification secret.
 *
 * - If JWT_SECRET is set, always use it.
 * - If unset in production, fail fast rather than fall back to a known constant.
 * - If unset outside production, use a dev-only constant (with a warning).
 *
 * Deliberately resolved LAZILY (on first use, not at module load): every
 * service runs validateServiceEnv() first, which reports ALL configuration
 * problems at once via ConfigError. A module-load throw here would preempt
 * that friendly aggregated report with a single opaque error.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) return secret.trim();
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET environment variable must be set in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    );
  }
  console.warn("[auth] JWT_SECRET is not set — using an insecure development-only secret. Set JWT_SECRET before deploying.");
  return DEV_FALLBACK_SECRET;
}

let cachedJwtSecret: string | undefined;
/** Memoised secret — validated once per process, then reused for every sign/verify. */
function getJwtSecret(): string {
  if (cachedJwtSecret === undefined) cachedJwtSecret = resolveJwtSecret();
  return cachedJwtSecret;
}

/**
 * Whether unauthenticated requests may fall back to the development user.
 * Always disabled in production unless ALLOW_DEV_USER_FALLBACK is explicitly "true"
 * (which itself should never be set in a real deployment).
 */
function devFallbackAllowed(): boolean {
  if (process.env.ALLOW_DEV_USER_FALLBACK === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Default development user used when no authenticated user is present.
 */
export const developmentUser = {
  email: "developer@flux.local",
  name: "FluX Developer",
} as const;

export function ensureDevelopmentUser(client: PrismaClient) {
  return client.user.upsert({
    where: { email: developmentUser.email },
    update: {},
    create: developmentUser,
  });
}

export type AuthKind = "api-key" | "jwt" | "dev";

export interface ResolvedAuth {
  userId: string;
  kind: AuthKind;
}

function extractApiKey(rawHeaders: Record<string, string | undefined>): string | undefined {
  const headerKey = rawHeaders["x-flux-api-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) return headerKey.trim();
  const authorization = rawHeaders.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.toLowerCase().startsWith("flux_")) return token;
  }
  return undefined;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Resolves the acting user from request headers.
 *
 * Priority:
 *  1. FluX API key (x-flux-api-key header or `Authorization: Bearer flux_...`)
 *  2. JWT (Authorization: Bearer <jwt>) issued by /auth/login
 *  3. Development user (only when no credentials were presented)
 *
 * An explicitly provided but invalid API key is rejected (kind stays "dev"
 * only when the request carried no credentials at all).
 */
export async function resolveAuthUser(
  rawHeaders: Record<string, string | undefined>,
  client: PrismaClient
): Promise<ResolvedAuth> {
  const apiKey = extractApiKey(rawHeaders);
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const record = await client.apiKey.findUnique({ where: { keyHash }, include: { user: true } });
    if (!record) throw new ApiKeyError("Invalid or revoked API key.");
    void client.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { userId: record.userId, kind: "api-key" };
  }

  const authorization = rawHeaders.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string };
      if (payload.sub) return { userId: payload.sub, kind: "jwt" };
    } catch {
      throw new AuthError("Invalid or expired authentication token.");
    }
  }

  // No credentials presented. Only fall back to the shared dev user outside
  // production — a production deployment must require an API key or JWT.
  if (!devFallbackAllowed()) {
    throw new AuthError("Authentication required. Provide an API key (x-flux-api-key) or a Bearer token.");
  }
  const devUser = await ensureDevelopmentUser(client);
  return { userId: devUser.id, kind: "dev" };
}

export class ApiKeyError extends Error {}
export class AuthError extends Error {}

export { getJwtSecret };
export type { User };
