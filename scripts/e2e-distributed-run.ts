/**
 * Proves the distributed happy path on the live stack:
 *   register -> create workflow (trigger -> code) -> run -> poll until SUCCESS
 *   The run travels API -> outbox -> processor -> Kafka -> worker -> Postgres.
 *   Nothing is deleted, so every node executes for real.
 *
 * Run: npx tsx scripts/e2e-distributed-run.ts
 */
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000";
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  console.log("\n=== 1. Register a temporary user ===");
  const email = `run-${randomUUID()}@flux.test`;
  const reg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Run User", email, password: "test-password-123" }),
  });
  check("register -> 201", reg.status === 201, `got ${reg.status}`);
  const token = (reg.body as { token?: string })?.token;
  const auth = { authorization: `Bearer ${token}` };

  console.log("\n=== 2. Create trigger -> code workflow ===");
  const wf = await req("/workflows", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "E2E distributed happy path",
      nodes: [
        { id: "trig", type: "trigger", name: "Trigger", config: { triggerType: "manual" }, position: { x: 0, y: 0 } },
        { id: "code", type: "code", name: "Compute", config: { language: "javascript", code: "return { ok: true, doubled: (input.n ?? 3) * 2 };" }, position: { x: 0, y: 140 } },
      ],
      edges: [{ id: "e1", sourceNodeId: "trig", targetNodeId: "code", config: {} }],
    }),
  });
  check("create workflow -> 201", wf.status === 201, `got ${wf.status}`);
  const wfId = (wf.body as { workflow?: { id: string } })?.workflow?.id;

  console.log("\n=== 3. Run it (outbox -> Kafka -> worker) ===");
  const run = await req(`/workflows/${wfId}/run`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ input: { n: 21 } }),
  });
  check("run -> 202", run.status === 202, `got ${run.status}`);
  const execId = (run.body as { execution?: { id: string } })?.execution?.id;

  console.log("\n=== 4. Poll the real execution until terminal ===");
  let status = "PENDING";
  let nodes: { node: { name: string }; status: string; output: unknown }[] = [];
  for (let i = 0; i < 120; i++) {
    const e = await req(`/executions/${execId}`, { headers: auth });
    const execution = (e.body as { execution?: { status: string; nodeExecutions: typeof nodes } })?.execution;
    if (execution) {
      status = execution.status;
      nodes = execution.nodeExecutions ?? [];
      if (status === "SUCCESS" || status === "FAILED" || status === "CANCELLED") break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("execution reached SUCCESS", status === "SUCCESS", `final status: ${status}`);
  const codeNode = nodes.find((n) => n.node.name === "Compute");
  check("code node executed", codeNode?.status === "SUCCESS", `status: ${codeNode?.status}`);
  check("code output is real (doubled 21 -> 42)",
    JSON.stringify((codeNode?.output as { result?: { doubled?: number } })?.result) === JSON.stringify({ ok: true, doubled: 42 }),
    `output: ${JSON.stringify(codeNode?.output)}`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED — distributed run completed for real" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(2);
});
