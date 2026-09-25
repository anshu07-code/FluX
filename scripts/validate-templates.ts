#!/usr/bin/env npx tsx
/**
 * End-to-end validation: runs every template and random workflows through
 * the distributed pipeline (API → outbox → processor → Kafka → worker → handler).
 *
 * Usage:  npx tsx scripts/validate-templates.ts
 * Requires: API on :4000, processor, worker, Kafka, Postgres.
 */

const BASE = process.env.FLUX_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 90_000;

// The API requires auth on every route — register a throwaway user in main().
let authToken: string | null = null;

const SAMPLE_INPUT = {
  value: 42, score: 92, status: "active", severity: "critical",
  usage: 97, amount: 150.5, items: [1, 2, 3], name: "E2E",
  environment: "production", threatLevel: 9, errorRate: 7.5,
  coverage: 85, stock: 5, daysRemaining: 10, isVip: 1,
  hasBreach: 1, isBug: 1, classification: "interested",
  type: "backend", volume: 600, days: 3,
};

// ─── helpers ────────────────────────────────────────────────────────────────
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`${r.status} ${r.statusText}: ${(body as any).error ?? r.statusText}`);
  }
  return r.json() as Promise<T>;
}

async function runAndWait(name: string, nodes: any[], edges: any[]) {
  const { workflow } = await api<{ workflow: any }>("/workflows", {
    method: "POST",
    body: JSON.stringify({ name, nodes, edges }),
  });

  const { execution } = await api<{ execution: any }>(`/workflows/${workflow.id}/run`, {
    method: "POST",
    body: JSON.stringify({ input: SAMPLE_INPUT }),
  });

  if (execution.status !== "PENDING" && execution.status !== "RUNNING" && execution.status !== "SUCCESS") {
    return { name, status: execution.status, error: execution.error, nodes: 0 };
  }

  const start = Date.now();
  let final = execution;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    final = await api<{ execution: any }>(`/executions/${execution.id}`);
    if (final.execution.status === "SUCCESS" || final.execution.status === "FAILED") break;
  }

  await api(`/workflows/${workflow.id}`, { method: "DELETE" }).catch(() => {});
  return {
    name,
    status: final.execution.status,
    error: final.execution.error,
    nodes: final.execution.nodeExecutions?.length ?? 0,
  };
}

// ─── templates (inline, avoids importing React components) ──────────────────
function makeWorkflow(name: string, specs: Array<{ type: string; name: string; from?: number | number[]; branch?: string }>) {
  const nodes = specs.map((s, i) => ({
    id: `n${i}`, type: s.type, name: s.name,
    config: defaultConfig(s.type),
    position: { x: 200 * i, y: (i % 2) * 150 },
  }));
  const edges: any[] = [];
  specs.forEach((s, i) => {
    if (s.from === undefined) return;
    const sources = Array.isArray(s.from) ? s.from : [s.from];
    sources.forEach((fi) => {
      edges.push({
        id: `e${fi}-${i}`, sourceNodeId: `n${fi}`, targetNodeId: `n${i}`,
        config: { branch: s.branch ?? "main" },
      });
    });
  });
  return { nodes, edges };
}

function defaultConfig(type: string): Record<string, unknown> {
  const map: Record<string, any> = {
    trigger: { triggerType: "webhook" },
    http: { method: "GET", url: "https://example.com", mockResponse: { value: 42, status: "ok" }, timeout: 5000 },
    webhook: { method: "POST", mockResponse: { ok: true } },
    ai: { provider: "openai", model: "gpt-4o-mini", prompt: "Summarize the input." },
    condition: { leftValue: "value", operator: "gt", rightValue: 5 },
    switch: { value: "value", rules: [{ value: "active", output: 0 }, { value: "inactive", output: 1 }] },
    filter: { inputPath: "items", condition: "status === 'active'" },
    code: { language: "javascript", code: "return { processed: true };" },
    set: { assignments: { processed: true } },
    email: { to: "test@flux.dev", subject: "Test", body: "Hello" },
    slack: { channel: "#test", message: "Test" },
    database: { operation: "findMany", table: "demo" },
    error: { action: "continue" },
    auth: { authType: "apikey", secret: "" },
    document: { parseMode: "text" },
    merge: { mode: "append" },
    split: { batchSize: 10 },
    loop: { inputPath: "items" },
    wait: { duration: 0, unit: "seconds" },
    delay: { duration: 0, unit: "seconds" },
    approval: { title: "Test", autoApprove: true },
    idempotency: { keyExpression: "{{value}}", ttl: 3600 },
  };
  return map[type] ?? {};
}

// ─── pre-built templates (covers every branching + join pattern) ────────────
const templates: Array<{ name: string; nodes: any[]; edges: any[] }> = [
  // 1. Linear: trigger → http → email
  {
    name: "Linear Pipeline",
    ...makeWorkflow("Linear Pipeline", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Fetch", from: 0 },
      { type: "email", name: "Notify", from: 1 },
    ]),
  },
  // 2. Condition branch: trigger → condition → (email true / email false)
  {
    name: "Condition Branch",
    ...makeWorkflow("Condition Branch", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Fetch", from: 0 },
      { type: "condition", name: "Check", from: 1 },
      { type: "email", name: "Yes Path", from: 2, branch: "true" },
      { type: "email", name: "No Path", from: 2, branch: "false" },
    ]),
  },
  // 3. Switch: trigger → switch → (case1 / case2 / default)
  {
    name: "Switch Routing",
    ...makeWorkflow("Switch Routing", [
      { type: "trigger", name: "Start" },
      { type: "switch", name: "Route", from: 0 },
      { type: "email", name: "Case1", from: 1, branch: "case1" },
      { type: "email", name: "Case2", from: 1, branch: "case2" },
      { type: "email", name: "Default", from: 1, branch: "default" },
    ]),
  },
  // 4. Diamond join: trigger → (A, B) → merge → email
  {
    name: "Diamond Join",
    ...makeWorkflow("Diamond Join", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Branch A", from: 0 },
      { type: "http", name: "Branch B", from: 0 },
      { type: "merge", name: "Merge", from: [1, 2] },
      { type: "email", name: "Done", from: 3 },
    ]),
  },
  // 5. Code + set: trigger → code → set → email
  {
    name: "Code Transform",
    ...makeWorkflow("Code Transform", [
      { type: "trigger", name: "Start" },
      { type: "code", name: "Process", from: 0 },
      { type: "set", name: "Annotate", from: 1 },
      { type: "email", name: "Result", from: 2 },
    ]),
  },
  // 6. AI + condition: trigger → http → ai → condition → email
  {
    name: "AI Analysis",
    ...makeWorkflow("AI Analysis", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Data", from: 0 },
      { type: "ai", name: "Analyze", from: 1 },
      { type: "condition", name: "Result?", from: 2 },
      { type: "email", name: "Report", from: 3, branch: "true" },
    ]),
  },
  // 7. Error handling: trigger → http → error → email
  {
    name: "Error Handler",
    ...makeWorkflow("Error Handler", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Risky Call", from: 0 },
      { type: "error", name: "Handle", from: 1 },
      { type: "email", name: "Alert", from: 2 },
    ]),
  },
  // 8. Auth gate: trigger → http → auth → (main / denied)
  {
    name: "Auth Gate",
    ...makeWorkflow("Auth Gate", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "Data", from: 0 },
      { type: "auth", name: "Verify", from: 1 },
      { type: "email", name: "Allowed", from: 2, branch: "main" },
      { type: "email", name: "Denied", from: 2, branch: "denied" },
    ]),
  },
  // 9. Triple branch (deep diamond): trigger → (A, B, C) → merge → email
  {
    name: "Triple Branch Join",
    ...makeWorkflow("Triple Branch Join", [
      { type: "trigger", name: "Start" },
      { type: "http", name: "A", from: 0 },
      { type: "http", name: "B", from: 0 },
      { type: "http", name: "C", from: 0 },
      { type: "merge", name: "Merge", from: [1, 2, 3] },
      { type: "email", name: "Done", from: 4 },
    ]),
  },
  // 10. Full e-commerce flow
  {
    name: "E-Commerce Order",
    ...makeWorkflow("E-Commerce Order", [
      { type: "trigger", name: "Order Webhook" },
      { type: "http", name: "Validate Order", from: 0 },
      { type: "condition", name: "Payment OK?", from: 1 },
      { type: "http", name: "Process Payment", from: 2, branch: "true" },
      { type: "email", name: "Confirmation", from: 3 },
      { type: "email", name: "Payment Failed", from: 2, branch: "false" },
    ]),
  },
];

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 FluX E2E Validation — ${BASE}\n`);

  // Auth setup: every route (workflows, runs, executions) requires a Bearer
  // token or API key now, so sign up a disposable account first.
  const email = `validate-${Date.now()}-${Math.random().toString(36).slice(2)}@flux.test`;
  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Template Validator", email, password: "test-password-123" }),
  });
  const regBody = (await reg.json().catch(() => ({}))) as { token?: string };
  if (!reg.ok || !regBody.token) {
    throw new Error(`setup failed: ${reg.status} ${JSON.stringify(regBody).slice(0, 200)}`);
  }
  authToken = regBody.token;

  const results: Array<{ name: string; status: string; error?: string; nodes: number }> = [];

  for (const t of templates) {
    process.stdout.write(`  ⏳ ${t.name}...`);
    try {
      const r = await runAndWait(t.name, t.nodes, t.edges);
      const icon = r.status === "SUCCESS" ? "✅" : "❌";
      console.log(` ${icon} ${r.status} (${r.nodes} nodes)${r.error ? ` — ${r.error}` : ""}`);
      results.push(r);
    } catch (err: any) {
      console.log(` ❌ ERROR: ${err.message}`);
      results.push({ name: t.name, status: "ERROR", error: err.message, nodes: 0 });
    }
  }

  const passed = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.length - passed;
  console.log(`\n📊 Results: ${passed}/${results.length} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log("Failures:");
    results.filter((r) => r.status !== "SUCCESS").forEach((r) => {
      console.log(`  ❌ ${r.name}: ${r.status} — ${r.error}`);
    });
  }
  // Remove the disposable account (and anything it still owns) so repeated
  // runs never leave users or test data behind.
  await api("/auth/me", { method: "DELETE", body: JSON.stringify({ password: "test-password-123" }) }).catch(() => {});

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  if (authToken) {
    await api("/auth/me", { method: "DELETE", body: JSON.stringify({ password: "test-password-123" }) }).catch(() => {});
  }
  process.exit(1);
});
