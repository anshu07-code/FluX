import { config as dotenvConfig } from "dotenv";
import fs from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * Locates and loads the project-root `.env` regardless of which service entry
 * point (or dist layout) is running. The old hard-coded `../../.env` path broke
 * for compiled worker/processor/scheduler bundles, which nest `api/src/db.js`
 * one level deeper — silently dropping DATABASE_URL/KAFKA_BROKERS in production.
 *
 * Search order:
 *   1. DOTENV_CONFIG_PATH (explicit override)
 *   2. Walk up from this module's directory (finds the repo root .env)
 *   3. Walk up from process.cwd() (npm workspaces start inside the package dir)
 */
function findEnvFile(): string | undefined {
  const candidates: string[] = [];
  if (process.env.DOTENV_CONFIG_PATH) candidates.push(process.env.DOTENV_CONFIG_PATH);

  const pushAncestors = (start: string) => {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      candidates.push(path.join(dir, ".env"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  };

  pushAncestors(import.meta.dirname);
  pushAncestors(process.cwd());

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // unreadable candidate — keep looking
    }
  }
  return undefined;
}

/** Loads `.env` exactly once. Existing process env vars are never overridden. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = findEnvFile();
  if (!file) {
    console.warn("[env] No .env file found — using process environment only.");
    return;
  }
  const result = dotenvConfig({ path: file });
  if (result.error) {
    console.error(`[env] Failed to parse ${file}:`, result.error.message);
    return;
  }
  console.log(`[env] Loaded environment from ${file}`);
}
