/**
 * PROVES the production fail-loud contract: in NODE_ENV=production an
 * unconfigured service node FAILS the run with an actionable error instead of
 * returning a mock result and reporting SUCCESS.
 *
 * Works against any production-mode stack (local or distributed) — the node
 * executors are shared, and the worker/processor run with the same NODE_ENV.
 *
 * Run: npm run e2e:fail-loud     (or API_URL=http://host:port npx tsx scripts/e2e-prod-fail-loud.ts)
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
  console.log(`\n=== Targeting ${API} (expecting NODE_ENV=production) ===`);

  console.log("\n=== 1. Register a temporary user ===");
  const email = `prod-${randomUUID()}@flux.test`;
  const reg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Prod User", email, password: "test-password-123" }),
  });
  check("register -> 201", reg.status === 201, `got ${reg.status} ${JSON.stringify(reg.body)?.slice(0, 120)}`);
  const token = (reg.body as { token?: string })?.token;
  const auth = { authorization: `Bearer ${token}` };

  console.log("\n=== 2. Create trigger -> SLACK (no webhook URL configured) ===");
  const wf = await req("/workflows", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "PROD fail-loud probe",
      nodes: [
        { id: "trig", type: "trigger", name: "Trigger", config: { triggerType: "manual" }, position: { x: 0, y: 0 } },
        { id: "slack", type: "slack", name: "Notify Channel", config: { message: "hello" }, position: { x: 0, y: 140 } },
      ],
      edges: [{ id: "e1", sourceNodeId: "trig", targetNodeId: "slack", config: {} }],
    }),
  });
  check("create workflow -> 201", wf.status === 201, `got ${wf.status}`);
  const wfId = (wf.body as { workflow?: { id: string } })?.workflow?.id;

  console.log("\n=== 3. Run it in production mode ===");
  const run = await req(`/workflows/${wfId}/run`, { method: "POST", headers: auth, body: JSON.stringify({ input: {} }) });
  check("run accepted -> 202", run.status === 202, `got ${run.status}`);
  const execId = (run.body as { execution?: { id: string } })?.execution?.id;

  console.log("\n=== 4. Poll the execution ===");
  let execStatus = "PENDING";
  let slackNode: { status: string; error: string | null; output: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    const e = await req(`/executions/${execId}`, { headers: auth });
    const execution = (e.body as { execution?: { status: string; nodeExecutions: Array<{ node: { id: string }; status: string; error: string | null; output: unknown }> } })?.execution;
    if (execution) {
      execStatus = execution.status;
      // Client-supplied node ids are remapped to UUIDs on save — match by type.
      slackNode = execution.nodeExecutions?.find((n) => n.node.id === "slack" || (n.node as { type?: string }).type === "slack");
      if (execStatus === "SUCCESS" || execStatus === "FAILED" || execStatus === "CANCELLED") break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n  execution status : ${execStatus}`);
  console.log(`  slack node status: ${slackNode?.status}`);
  console.log(`  slack node error : ${slackNode?.error}`);
  console.log(`  slack node output: ${JSON.stringify(slackNode?.output)}`);

  check("execution is FAILED (not SUCCESS)", execStatus === "FAILED", `got ${execStatus}`);
  check("slack node is FAILED", slackNode?.status === "FAILED", `got ${slackNode?.status}`);
  check(
    "error names the missing config",
    typeof slackNode?.error === "string" && /webhook URL/i.test(slackNode.error),
    `error: ${slackNode?.error}`
  );
  check(
    "no mock success payload was produced",
    !(slackNode?.output && typeof slackNode.output === "object" && (slackNode.output as { mock?: boolean }).mock === true),
    `output was: ${JSON.stringify(slackNode?.output)}`
  );

  // Remove the disposable account (cascades its workflow + executions) so
  // repeated runs never leave test data behind.
  await req("/auth/me", { method: "DELETE", headers: auth, body: JSON.stringify({ password: "test-password-123" }) });

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED — production fails loudly, nothing is silently mocked" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("E2E script crashed:", err);
  process.exit(2);
});
