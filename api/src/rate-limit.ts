import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { getJwtSecret } from "./development-user.js";

type Window = { count: number; resetAt: Date };

/**
 * Postgres-backed fixed-window counter. A single atomic upsert keeps the
 * count correct across concurrent requests AND across multiple API
 * instances (an in-memory Map would give every instance its own budget).
 */
async function hit(key: string, windowMs: number, now: Date): Promise<Window> {
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<Array<Window>>`
    INSERT INTO "RateLimitCounter" ("key", count, "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      count = CASE WHEN "RateLimitCounter"."resetAt" <= ${now} THEN 1 ELSE "RateLimitCounter".count + 1 END,
      "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitCounter"."resetAt" END
    RETURNING count, "resetAt"`;
  return rows[0];
}

/** Opportunistically drop expired windows (~2% of hits); failures are harmless. */
async function prune(now: Date): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "resetAt" <= ${now}`;
}

/**
 * Bucket key for authenticated endpoints: prefer the caller's identity over
 * its IP so legitimate users behind one NAT don't share a budget and API
 * keys can't dodge limits by rotating IPs.
 *
 *  - `Authorization: Bearer flux_...` / `x-flux-api-key` → sha256(key) prefix
 *    (never the raw secret — this string is stored in Postgres)
 *  - `Authorization: Bearer <jwt>`                       → verified user id
 *  - anything else (missing/invalid credentials)         → client IP
 */
export function credentialKey(request: Request): string {
  const bearer = request.header("authorization");
  const bearerToken =
    bearer && bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : undefined;
  const apiKey = request.header("x-flux-api-key")?.trim() || bearerToken;

  if (apiKey?.startsWith("flux_")) {
    const digest = crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 24);
    return `key:${digest}`;
  }
  if (apiKey) {
    try {
      const decoded = jwt.verify(apiKey, getJwtSecret()) as { sub?: unknown };
      if (typeof decoded.sub === "string" && decoded.sub) return `user:${decoded.sub}`;
    } catch {
      // Invalid token: bucket by IP — the request itself will be rejected later.
    }
  }
  return `ip:${request.ip ?? "unknown"}`;
}

type RateLimitOptions = {
  /** Namespace so different endpoints keep independent budgets. */
  name: string;
  windowMs?: number;
  max?: number;
  /** Defaults to client IP. Pass `credentialKey` for authenticated routes. */
  keyOf?: (request: Request) => string;
};

export function rateLimit(options: RateLimitOptions) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;
  const keyOf = options.keyOf ?? ((request: Request) => `ip:${request.ip ?? "unknown"}`);
  let lastStoreWarning = 0;

  return (request: Request, response: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "test") return next();

    const key = `${options.name}:${keyOf(request)}`;
    const now = new Date();

    hit(key, windowMs, now)
      .then(async (window) => {
        if (Math.random() < 0.02) {
          try {
            await prune(now);
          } catch {
            // prune is best-effort only
          }
        }
        if (window.count > max) {
          const retryAfter = Math.max(1, Math.ceil((window.resetAt.getTime() - now.getTime()) / 1000));
          response.setHeader("Retry-After", String(retryAfter));
          response.status(429).json({ error: `Too many attempts. Try again in ${retryAfter} seconds.` });
          return;
        }
        next();
      })
      .catch((error: unknown) => {
        // Fail open: a rate limiter must never take the API down (e.g. a DB
        // hiccup would otherwise block logins too). Log throttled so an
        // outage is visible without drowning the console.
        const timestamp = Date.now();
        if (timestamp - lastStoreWarning > 60_000) {
          lastStoreWarning = timestamp;
          console.error("[rate-limit] counter store unavailable; allowing request:", error instanceof Error ? error.message : error);
        }
        next();
      });
  };
}
