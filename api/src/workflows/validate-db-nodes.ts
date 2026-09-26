import { prisma } from "../db.js";
import {
  INTERNAL_TABLES,
  fetchTableColumns,
  isValidTableName,
  listBusinessTables,
  sanitizeColumnName,
} from "../execution/db-support.js";

type ValidatableNode = {
  id: string;
  type: string;
  name: string;
  config: unknown;
};

/**
 * Save/activate-time checks for database nodes. Returns a human-readable
 * error naming the offending node, or null when the graph is sound.
 *
 * Execution-time auto-create handles missing tables for Create nodes; this
 * gate catches the rest (typos, wrong columns, internal tables) before a
 * workflow can even go ACTIVE, instead of failing silently at run time.
 */
export async function validateDatabaseNodes(nodes: ValidatableNode[]): Promise<string | null> {
  for (const node of nodes) {
    if (node.type !== "database") continue;
    const label = `Node "${node.name || node.id}"`;
    const config: Record<string, unknown> =
      node.config && typeof node.config === "object" && !Array.isArray(node.config)
        ? (node.config as Record<string, unknown>)
        : {};

    const operation = typeof config.operation === "string" && config.operation ? config.operation : "findMany";
    if (operation === "raw") continue; // Raw Query is checked when it runs.

    const table = typeof config.table === "string" ? config.table.trim() : "";
    if (!table) {
      return `${label}: database node has no table configured. Set a Table in the node config.`;
    }
    if (!isValidTableName(table)) {
      return `${label}: table name "${table}" is invalid. Use only letters, digits and underscores (max 63 characters).`;
    }
    if (INTERNAL_TABLES.has(table.toLowerCase())) {
      return `${label}: "${table}" is a FluX internal table and cannot be used in a workflow.`;
    }

    const autoCreate = config.autoCreate !== false;
    const columns = await fetchTableColumns(table);

    if (!columns) {
      if (operation === "create" && autoCreate) continue; // created on first run
      const available = await listBusinessTables();
      return (
        `${label}: table "${table}" does not exist. Existing tables: ${available.length > 0 ? available.join(", ") : "none"}. ` +
        (operation === "create"
          ? 'Turn on "Auto-Create Table" in this node to have FluX create it automatically on the first run.'
          : "Point the node at an existing table, or add a Create node with \"Auto-Create Table\" enabled to create it first.")
      );
    }

    // Columns this node's filters reference must exist on the table.
    if (operation !== "create") {
      const referenced = new Set<string>();
      const where = config.where;
      if (where && typeof where === "object" && !Array.isArray(where)) {
        for (const key of Object.keys(where as Record<string, unknown>)) referenced.add(key);
      }
      if (Array.isArray(config.conditions)) {
        for (const cond of config.conditions as Array<{ field?: unknown }>) {
          if (cond && typeof cond === "object" && cond.field) referenced.add(String(cond.field));
        }
      }
      if (typeof config.filterField === "string" && config.filterField) referenced.add(config.filterField);

      for (const field of referenced) {
        const column = sanitizeColumnName(field);
        if (column && !columns.has(column)) {
          return (
            `${label}: column "${column}" does not exist on "${table}". ` +
            `Available columns: ${[...columns.keys()].join(", ")}.`
          );
        }
      }
    }

    // Write data must land on real columns — either existing ones or columns
    // the node will add itself (auto-create on).
    if (operation === "create" || operation === "update") {
      if (autoCreate) continue;
      const data = config.data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const key of Object.keys(data as Record<string, unknown>)) {
          if (key === "owner_id") continue;
          const column = sanitizeColumnName(key);
          if (column && !columns.has(column)) {
            return (
              `${label}: column "${column}" does not exist on "${table}" and "Auto-Create Table" is off. ` +
              `Available columns: ${[...columns.keys()].join(", ")}.`
            );
          }
        }
      }
    }
  }
  return null;
}
