import type { PrismaClient } from "@prisma/client";
import { loadEnv } from "./env.js";

loadEnv();

export type ServiceName = "api" | "worker" | "processor" | "scheduler";

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      "Fatal configuration error — refusing to start:\n" +
        issues.map((issue) => `  ✖ ${issue}`).join("\n") +
        "\nFix the values in .env (see .env.example) and restart."
    );
    this.name = "ConfigError";
  }
}

/**
 * Validates the environment for the given service and FAILS FAST with every
 * problem listed at once — a misconfigured deploy must never come up partially
 * and silently serve mocks or stall executions.
 */
export function validateServiceEnv(service: ServiceName): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";
  const mode = (process.env.EXECUTION_MODE ?? "").trim().toLowerCase() || "local";

  // ── Required for every service ───────────────────────────────────────────
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    errors.push("DATABASE_URL is not set — the API cannot connect to PostgreSQL.");
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    errors.push(`DATABASE_URL does not look like a PostgreSQL URL (got "${databaseUrl.slice(0, 24)}…").`);
  }

  if (mode !== "local" && mode !== "distributed") {
    errors.push(`EXECUTION_MODE="${process.env.EXECUTION_MODE}" is invalid — must be "local" or "distributed".`);
  }

  // ── Distributed mode needs Kafka ─────────────────────────────────────────
  if (mode === "distributed") {
    const brokers = process.env.KAFKA_BROKERS?.trim();
    if (!brokers) {
      errors.push(
        'EXECUTION_MODE="distributed" but KAFKA_BROKERS is not set — every workflow run would stall in PENDING forever.'
      );
    }
  }

  // ── Production-only hard requirements ────────────────────────────────────
  if (isProd) {
    const jwt = process.env.JWT_SECRET?.trim();
    if (!jwt) {
      errors.push(
        'JWT_SECRET is not set — required in production. Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    } else if (jwt === "flux-dev-secret-change-in-production" || jwt === "replace-me-with-a-long-random-hex-string") {
      errors.push(
        "JWT_SECRET is a known placeholder (shipped in .env.example / the dev default) — generate a unique secret before deploying."
      );
    } else if (jwt.length < 32) {
      errors.push(
        `JWT_SECRET is only ${jwt.length} characters — use at least 32 random characters (e.g. randomBytes(48).toString('hex')).`
      );
    }

    if (service === "api") {
      const corsRaw = process.env.CORS_ORIGIN?.trim();
      if (!corsRaw) {
        errors.push(
          "CORS_ORIGIN is not set — it would default to http://localhost:3000 and block every remote browser."
        );
      } else {
        const origins = corsRaw.split(",").map((o) => o.trim()).filter(Boolean);
        if (origins.length === 0) {
          errors.push("CORS_ORIGIN is set but contains no origins.");
        }
        for (const origin of origins) {
          if (/localhost|127\.0\.0\.1/i.test(origin)) {
            warnings.push(`CORS_ORIGIN includes "${origin}" — browsers on that origin work, but remote users' real domain must be listed too (comma-separated).`);
          }
        }
      }

      if (process.env.ALLOW_DEV_USER_FALLBACK === "true") {
        errors.push(
          'ALLOW_DEV_USER_FALLBACK="true" in production — anyone without credentials gets the shared dev user. Remove it.'
        );
      }
    }
  } else {
    warnings.push(
      `NODE_ENV is not "production" — MOCK node responses are ENABLED and unauthenticated requests fall back to the dev user. Set NODE_ENV=production before deploying.`
    );
  }

  // ── Fail or warn ─────────────────────────────────────────────────────────
  if (errors.length > 0) throw new ConfigError(errors);
  for (const warning of warnings) console.warn(`[config] WARNING: ${warning}`);

  const mockState = isProd ? "OFF (fail-loud, real calls only)" : "ON (development mocks)";
  console.log(
    `[config] ${service} ok | NODE_ENV=${process.env.NODE_ENV ?? "development"} | EXECUTION_MODE=${mode}` +
      ` | mocks=${mockState}` +
      (mode === "distributed" ? ` | kafka=${process.env.KAFKA_BROKERS ?? "?"}` : "")
  );
}

/** Verifies Postgres is actually reachable. Throws a clear error instead of letting Prisma fail per-request with opaque 500s. */
export async function assertDatabaseReachable(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[config] PostgreSQL connection OK.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError([
      `Cannot reach PostgreSQL via DATABASE_URL: ${detail.split("\n")[0]}`,
      "Check that the database is running, the credentials are correct, and the host is reachable from this machine.",
    ]);
  }
}
