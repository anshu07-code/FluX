import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdWorkflowIds: string[] = [];
const suffix = `${Date.now()}`;
const tableIncidents = `flux_it_${suffix}`;
const tableScope = `flux_scope_${suffix}`;
const tableDoomed = `flux_doomed_${suffix}`;
const tableUpdate = `flux_upd_${suffix}`;
const tableCols = `flux_cols_${suffix}`;

function node(id: string, type: string, config: Record<string, unknown> = {}) {
  return { id: `${suffix}-${id}`, type, name: type, config: { label: type, type, ...config }, position: { x: 0, y: 0 } };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, config: Record<string, unknown> = {}) {
  return { id: `${suffix}-${id}`, sourceNodeId: `${suffix}-${sourceNodeId}`, targetNodeId: `${suffix}-${targetNodeId}`, config };
}

async function createGraph(name: string, nodes: object[], edges: object[], expectStatus = 201) {
  const response = await request(app).post("/workflows").send({ name: `${name}-${suffix}`, nodes, edges });
  expect(response.status).toBe(expectStatus);
  if (expectStatus === 201) createdWorkflowIds.push(response.body.workflow.id);
  return response.body as { workflow?: { id: string }; error?: string };
}

async function runAndWait(workflowId: string, input: Record<string, unknown> = {}) {
  const started = await request(app).post(`/workflows/${workflowId}/run`).send({ input }).expect(202);
  const executionId = started.body.execution.id as string;
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await request(app).get(`/executions/${executionId}`).expect(200);
    if (!["PENDING", "RUNNING"].includes(response.body.execution.status)) return response.body.execution;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Execution did not finish in time.");
}

function databaseOutput(
  execution: { nodeExecutions: Array<{ node?: { type: string }; output: unknown }> },
  name = "database"
) {
  const record = execution.nodeExecutions.find((item) => item.node?.type === name);
  const output = record?.output as { output?: { records?: unknown[]; record?: Record<string, unknown> } };
  return output?.output;
}

describe("database nodes: schema-on-write, owner scoping, friendly errors", () => {
  it("auto-creates a missing table on Create, sanitizes keys and stores typed values", async () => {
    const body = await createGraph("autocreate", [
      node("trigger", "trigger"),
      node("db", "database", {
        operation: "create",
        table: tableIncidents,
        data: {
          "Incident Title": "Disk full on srv-1",
          severity: "critical",
          "retry count": 3,
          active: true,
          details: { host: "srv-1", "free pct": 2 },
        },
      }),
    ], [edge("t-db", "trigger", "db")]);

    const execution = await runAndWait(body.workflow!.id);
    expect(execution.status).toBe("SUCCESS");

    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
      tableIncidents
    );
    const names = cols.map((column) => column.column_name);
    expect(names).toEqual(
      expect.arrayContaining(["id", "owner_id", "created_at", "IncidentTitle", "severity", "retrycount", "active", "details"])
    );

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "${tableIncidents}"`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("critical");
    expect(Number(rows[0].retrycount)).toBe(3);
    expect(rows[0].active).toBe(true);
    expect(String(rows[0].owner_id ?? "")).not.toBe("");
    const details = typeof rows[0].details === "string" ? JSON.parse(rows[0].details) : rows[0].details;
    expect(details).toEqual({ host: "srv-1", "free pct": 2 });
  });

  it("scopes reads to the workflow owner: own rows visible, foreign rows hidden", async () => {
    const createBody = await createGraph("scope-create", [
      node("trigger", "trigger"),
      node("db", "database", {
        operation: "create",
        table: tableScope,
        data: { title: "mine", status: "open" },
      }),
    ], [edge("t-db", "trigger", "db")]);
    const created = await runAndWait(createBody.workflow!.id);
    expect(created.status).toBe("SUCCESS");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${tableScope}" ("title", "status", "owner_id") VALUES ('foreign-a', 'open', 'someone-else'), ('foreign-b', 'open', NULL)`
    );

    const readBody = await createGraph("scope-read", [
      node("trigger", "trigger"),
      node("db", "database", { operation: "findMany", table: tableScope }),
    ], [edge("t-db", "trigger", "db")]);
    const read = await runAndWait(readBody.workflow!.id);
    expect(read.status).toBe("SUCCESS");

    const records = (databaseOutput(read)?.records ?? []) as Array<{ title: string }>;
    const titles = records.map((row) => row.title);
    expect(titles).toContain("mine");
    expect(titles).not.toContain("foreign-a");
    expect(titles).not.toContain("foreign-b");
  });

  it("explains a missing table at run time instead of a raw SQLSTATE", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${tableDoomed}" ("id" BIGSERIAL PRIMARY KEY, "note" TEXT)`
    );
    const body = await createGraph("doomed", [
      node("trigger", "trigger"),
      node("db", "database", { operation: "findMany", table: tableDoomed }),
    ], [edge("t-db", "trigger", "db")]);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableDoomed}"`);

    const execution = await runAndWait(body.workflow!.id);
    expect(execution.status).toBe("FAILED");
    expect(execution.error).toContain(`Table "${tableDoomed}" does not exist`);
    expect(execution.error).toContain("Auto-Create Table");
  });

  it("explains a missing column at run time instead of a raw SQLSTATE", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${tableCols}" ("id" BIGSERIAL PRIMARY KEY, "owner_id" TEXT, "a" TEXT, "b" TEXT)`
    );
    const body = await createGraph("missing-col", [
      node("trigger", "trigger"),
      node("db", "database", {
        operation: "update",
        table: tableCols,
        where: { b: "x" },
        data: { a: "y" },
      }),
    ], [edge("t-db", "trigger", "db")]);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableCols}" DROP COLUMN "b"`);

    const execution = await runAndWait(body.workflow!.id);
    expect(execution.status).toBe("FAILED");
    expect(execution.error).toContain(`Column "b" does not exist`);
    expect(execution.error).toContain("Available columns");
  });

  it("updates rows with filter conditions (SET and WHERE params numbered separately)", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${tableUpdate}" ("id" BIGSERIAL PRIMARY KEY, "owner_id" TEXT, "title" TEXT, "status" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now())`
    );
    const body = await createGraph("update", [
      node("trigger", "trigger"),
      node("create", "database", {
        operation: "create",
        table: tableUpdate,
        data: { title: "first", status: "open" },
      }),
      node("update", "database", {
        operation: "update",
        table: tableUpdate,
        where: { status: "open" },
        data: { status: "closed", "closed note": "done" },
      }),
    ], [edge("t-c", "trigger", "create"), edge("c-u", "create", "update")]);

    const execution = await runAndWait(body.workflow!.id);
    expect(execution.status).toBe("SUCCESS");

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "${tableUpdate}"`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("closed");
    expect(rows[0].closednote).toBe("done");
  });

  it("rejects saving database nodes that point at missing tables or wrong columns", async () => {
    const missing = await createGraph("val-missing", [
      node("trigger", "trigger"),
      node("db", "database", { operation: "findMany", table: `flux_nope_${suffix}` }),
    ], [edge("t-db", "trigger", "db")], 400);
    expect(missing.error).toContain("does not exist");

    const internal = await createGraph("val-internal", [
      node("trigger", "trigger"),
      node("db", "database", { operation: "findMany", table: "user" }),
    ], [edge("t-db", "trigger", "db")], 400);
    expect(internal.error).toContain("internal table");

    const badColumn = await createGraph("val-column", [
      node("trigger", "trigger"),
      node("db", "database", { operation: "findMany", table: tableIncidents, where: { nope_col: 1 } }),
    ], [edge("t-db", "trigger", "db")], 400);
    expect(badColumn.error).toContain('column "nope_col" does not exist');

    const noAuto = await createGraph("val-noauto", [
      node("trigger", "trigger"),
      node("db", "database", {
        operation: "create",
        table: `flux_noauto_${suffix}`,
        autoCreate: false,
        data: { a: 1 },
      }),
    ], [edge("t-db", "trigger", "db")], 400);
    expect(noAuto.error).toContain("Auto-Create Table");
  });
});

afterAll(async () => {
  for (const workflowId of createdWorkflowIds) await request(app).delete(`/workflows/${workflowId}`);
  for (const table of [tableIncidents, tableScope, tableDoomed, tableUpdate, tableCols]) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
  }
  await prisma.$disconnect();
});
