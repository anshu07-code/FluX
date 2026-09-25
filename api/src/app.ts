import cors from "cors";
import express from "express";
import authRouter from "./auth/router.js";
import dashboardRouter from "./dashboard/router.js";
import { executionRouter } from "./execution/router.js";
import { workflowErrorHandler, workflowRouter } from "./workflows/router.js";
import { apiKeysRouter, apiKeysErrorHandler } from "./api-keys/router.js";
import webhookRouter from "./webhooks/router.js";
import { ApiKeyError, AuthError } from "./development-user.js";
import { rateLimit } from "./rate-limit.js";

export const app = express();

// Behind a reverse proxy / load balancer Express would otherwise rate-limit
// by the proxy's IP (one shared bucket for ALL clients, and X-Forwarded-For
// is spoofable). Set TRUST_PROXY only when actually behind a proxy:
//   TRUST_PROXY=1     — one proxy hop (nginx, ALB)
//   TRUST_PROXY=true  — trust every hop (only if the proxy always overwrites XFF)
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true");
}

// Authenticated JSON API — never serve cached/304 responses. Express's default
// ETag made repeat dashboard polls return an empty 304, which the client
// treated as a failed request and rendered as zeros.
app.set("etag", false);

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Access log — method, path, status, auth mode, origin. No secrets are logged.
app.use((req, res, next) => {
  res.on("finish", () => {
    const auth = req.headers["x-flux-api-key"] ? "key" : req.headers.authorization ? "bearer" : "none";
    console.log(`[req] ${req.method} ${req.url} -> ${res.statusCode} | auth=${auth} | origin=${req.headers.origin ?? "-"}`);
  });
  next();
});

// CORS — only the configured frontend origin(s) may call the API from a
// browser. CORS_ORIGIN accepts a comma-separated list so dev (localhost:3001
// when 3000 is taken) and prod domains can coexist. Requests without an
// Origin header (curl, server-to-server, webhooks) are not subject to CORS.
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin) => origin.length > 0);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    callback(null, allowedOrigins.includes(normalized));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "flux-api" });
});

// Credential endpoints are brute-force / reset-mail-spam targets — give each
// IP a bounded number of attempts per minute (429 + Retry-After).
const credentialAttempts = rateLimit({ name: "credentials", max: 30 });
app.use("/auth/login", credentialAttempts);
app.use("/auth/register", credentialAttempts);
app.use("/auth/forgot-password", rateLimit({ name: "password-reset", max: 10 }));
app.use("/auth/reset-password", credentialAttempts);

app.use("/auth", authRouter);
app.use("/workflows", workflowRouter);
app.use("/executions", executionRouter);
app.use("/dashboard", dashboardRouter);
app.use("/api-keys", apiKeysRouter);
// Public webhook receiver — anyone on the internet can POST here, and each
// accepted POST fans out a workflow run (DB writes + outbound HTTP/LLM calls).
// Cap bursts per client IP so a single abuser can't flood trigger workflows.
app.use("/webhooks", rateLimit({ name: "webhooks", max: 120 }));
app.use("/webhooks", webhookRouter);

// Auth error handling — 401 for auth failures, then pass through
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof ApiKeyError || error instanceof AuthError) {
    return res.status(401).json({ error: error.message });
  }
  next(error);
});

// Route-level error handlers
app.use(apiKeysErrorHandler);
app.use(workflowErrorHandler);

// Catch-all — ensures no error silently disappears
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[app] Request failed:", error);

  // Malformed JSON bodies and other client errors must be 4xx, not opaque 500s.
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : typeof (error as { statusCode?: unknown })?.statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : undefined;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 400 ? "Invalid JSON request body." : "Request failed." });
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  // Never leak internals (stack-prone Prisma/driver messages) to clients in
  // production; development keeps the detail for debugging.
  const safe = process.env.NODE_ENV === "production" ? "Internal server error." : message;
  res.status(500).json({ error: safe });
});