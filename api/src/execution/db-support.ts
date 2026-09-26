import { prisma } from "../db.js";

/**
 * Shared helpers for database nodes: schema introspection, safe identifier
 * handling, schema-on-write (auto-create) and PostgreSQL error translation.
 * Used by the database node executor and by save/activate-time validation.
 */

/** Tables FluX owns (credentials, hashes, execution state) — never node-accessible. */
export const INTERNAL_TABLES = new Set([
  "user", "account", "session", "activitylog", "workflow", "workflownode",
  "workflowedge", "workflowexecution", "nodeexecution", "outboxevent",
  "workflowtemplate", "deadeletevent", "apikey", "_prisma_migrations",
]);

export function isValidTableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name.length <= 63;
}

/**
 * Normalizes a data/config key into a plain SQL identifier. Must stay byte-for-byte
 * identical to the field sanitizer used in the WHERE builder so a key like
 * "incident title" produces the same column name on INSERT and in filters.
 */
export function sanitizeColumnName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "");
}

export function inferPgType(value: unknown): string {
  if (value === null || value === undefined) return "TEXT";
  if (typeof value === "boolean") return "BOOLEAN";
  if (typeof value === "number") return Number.isFinite(value) ? "NUMERIC" : "TEXT";
  if (typeof value === "object") return "JSONB";
  return "TEXT";
}

/** Column name -> PostgreSQL data_type (lowercased) for an existing table. */
export type ColumnMap = Map<string, string>;

export async function fetchTableColumns(table: string): Promise<ColumnMap | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    table
  );
  if (rows.length === 0) return null;
  const map: ColumnMap = new Map();
  for (const row of rows) map.set(String(row.column_name), String(row.data_type).toLowerCase());
  return map;
}

/** Existing user tables (excluding FluX internals), for error messages. */
export async function listBusinessTables(limit = 25): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows
    .map((row) => String(row.table_name))
    .filter((name) => !INTERNAL_TABLES.has(name.toLowerCase()) && !name.startsWith("_"))
    .slice(0, limit);
}

export interface PlannedColumn {
  /** Sanitized column name used in SQL. */
  key: string;
  /** Original key in the node's data object (where the value comes from). */
  sourceKey: string;
  /** Type inferred from the value (used only when the column must be added). */
  type: string;
}

/**
 * Maps a data object onto columns: sanitizes keys, de-duplicates collisions,
 * and infers a PostgreSQL type per value. `owner_id` is system-managed and
 * never taken from user data.
 */
export function planDataColumns(data: Record<string, unknown>): { plan: PlannedColumn[]; error?: string } {
  const entries = Object.entries(data).filter(([key]) => key !== "owner_id");
  if (entries.length > 50) {
    return { plan: [], error: `Too many data fields (${entries.length}) — a single node can save at most 50 columns.` };
  }
  const seen = new Set<string>();
  const plan: PlannedColumn[] = [];
  for (const [sourceKey, value] of entries) {
    let key = sanitizeColumnName(sourceKey);
    if (!key) {
      return { plan: [], error: `Data key "${sourceKey}" contains no usable characters (letters, digits and underscores only).` };
    }
    if (seen.has(key)) {
      let n = 2;
      while (seen.has(`${key}_${n}`)) n++;
      key = `${key}_${n}`;
    }
    seen.add(key);
    plan.push({ key, sourceKey, type: inferPgType(value) });
  }
  if (plan.length === 0) {
    return { plan: [], error: "No data fields to save." };
  }
  return { plan };
}

/**
 * Adds any planned columns that are missing on an existing table (schema-on-write).
 * Returns the up-to-date column map.
 */
export async function ensureDataColumns(table: string, plan: PlannedColumn[], existing: ColumnMap): Promise<ColumnMap> {
  const columns = new Map(existing);
  for (const column of plan) {
    if (columns.has(column.key)) continue;
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.key}" ${column.type}`);
    columns.set(column.key, column.type.toLowerCase());
  }
  return columns;
}

/**
 * Creates a missing table for a Create node: surrogate key, owner scoping
 * column, created_at, plus the planned data columns. Re-checks and adds any
 * columns a concurrent creator may have skipped (CREATE IF NOT EXISTS is a
 * no-op when another process won the race).
 */
export async function createTableIfMissing(table: string, plan: PlannedColumn[]): Promise<ColumnMap> {
  const defs = [
    `"id" BIGSERIAL PRIMARY KEY`,
    `"owner_id" TEXT`,
    `"created_at" TIMESTAMPTZ NOT NULL DEFAULT now()`,
  ];
  const taken = new Set(["id", "owner_id", "created_at"]);
  for (const column of plan) {
    if (taken.has(column.key)) continue;
    taken.add(column.key);
    defs.push(`"${column.key}" ${column.type}`);
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${table}" (${defs.join(", ")})`);
  const columns = await fetchTableColumns(table);
  if (!columns) {
    throw new Error(`Table "${table}" could not be created.`);
  }
  return ensureDataColumns(table, plan, columns);
}

/**
 * Prepares one bound parameter for an INSERT/UPDATE: objects and arrays are
 * JSON-stringified (with a cast when the target column is json/jsonb), so a
 * node can save nested payloads into both auto-created and legacy tables.
 */
export function serializeParam(value: unknown, type: string | undefined): { value: unknown; cast: string } {
  if (value === null || value === undefined) return { value: null, cast: "" };
  const isJson = typeof type === "string" && type.includes("json");
  if (isJson) return { value: JSON.stringify(value), cast: `::${type}` };
  if (typeof value === "object") return { value: JSON.stringify(value), cast: "" };
  return { value, cast: "" };
}

/** 5-digit SQLSTATE, if this error carries one. */
export function extractPgCode(error: unknown): string | null {
  const candidate = error as { meta?: { code?: unknown }; code?: unknown } | null;
  const metaCode = candidate?.meta?.code;
  if (typeof metaCode === "string" && /^\d{5}$/.test(metaCode)) return metaCode;
  if (typeof candidate?.code === "string" && /^\d{5}$/.test(candidate.code)) return candidate.code;
  const message = error instanceof Error ? error.message : "";
  return /(?:Code|SQLSTATE):\s*`?(\d{5})`?/.exec(message)?.[1] ?? null;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Translates raw PostgreSQL failures into instructions a non-DBA can act on.
 * Returns null for anything unrecognized (caller falls back to the raw message).
 */
export async function friendlyDbError(
  error: unknown,
  context: { table: string; columns?: ColumnMap | null }
): Promise<string | null> {
  const code = extractPgCode(error);
  const raw = error instanceof Error ? error.message : String(error);

  if (code === "42P01" || /relation "[^"]+" does not exist|table "[^"]+" does not exist/i.test(raw)) {
    const available = await listBusinessTables();
    return (
      `Table "${context.table}" does not exist. Existing tables: ${available.length > 0 ? available.join(", ") : "none"}. ` +
      `Enable "Auto-Create Table" on a Create node and the table will be built automatically on the next run.`
    );
  }
  if (code === "42703" || /column "[^"]+" of relation/i.test(raw)) {
    const column = /column "([^"]+)"/.exec(raw)?.[1];
    const available = [...(context.columns?.keys() ?? [])];
    return (
      `Column ${column ? `"${column}"` : "in the statement"} does not exist on "${context.table}". ` +
      `Available columns: ${available.length > 0 ? available.join(", ") : "unknown"}. ` +
      `A Create/Update node with "Auto-Create Table" enabled adds missing columns automatically.`
    );
  }
  if (code === "42804") {
    return `A value's type does not match its column on "${context.table}": ${truncate(raw)}`;
  }
  if (code === "22P02") {
    return `A value is not valid for its column's type on "${context.table}": ${truncate(raw)}`;
  }
  if (code === "23505") {
    return `Duplicate value violates a unique constraint on "${context.table}": ${truncate(raw)}`;
  }
  if (code === "42501") {
    return `The database refused access to "${context.table}": ${truncate(raw)}`;
  }
  return null;
}
