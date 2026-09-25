import { allTemplates } from "../frontend/src/lib/templates-data.js";
import { defaultNodeConfig } from "../frontend/src/lib/template-defaults.js";
import { prisma } from "../api/src/db.js";

const API = "http://localhost:4000";

// Test-created workflows use deterministic node ids "<template-id>-n<i>"; the app
// always uses crypto.randomUUID(), so this pattern uniquely identifies test data.
const TEST_NODE_ID = /-n\d+(-\d+)?$/;

/** Delete every workflow created by a previous test run (and this run's output). */
async function cleanupTestWorkflows(): Promise<number> {
  const all = await prisma.workflow.findMany({ select: { id: true, nodes: { select: { id: true } } } });
  const junk = all.filter((w) => w.nodes.some((n) => TEST_NODE_ID.test(n.id)));
  for (const w of junk) {
    const nodeIds = w.nodes.map((n) => n.id);
    const execs = await prisma.workflowExecution.findMany({ where: { workflowId: w.id }, select: { id: true } });
    const execIds = execs.map((e) => e.id);
    await prisma.deadLetterEvent.deleteMany({ where: { nodeId: { in: nodeIds } } });
    if (execIds.length) await prisma.nodeExecution.deleteMany({ where: { executionId: { in: execIds } } });
    await prisma.activityLog.deleteMany({ where: { resourceId: { in: [w.id, ...execIds] } } });
    await prisma.workflowExecution.deleteMany({ where: { workflowId: w.id } });
    await prisma.workflowEdge.deleteMany({ where: { workflowId: w.id } });
    await prisma.workflowNode.deleteMany({ where: { workflowId: w.id } });
    await prisma.workflow.delete({ where: { id: w.id } });
  }
  return junk.length;
}

/**
 * Node config built exactly the way the builder instantiates templates:
 * real app defaults (defaultNodeConfig) first, then template-specific overrides.
 * Delay/wait durations are zeroed (test-only override) because real templates
 * use durable waits (2 min – 1 day) that are resumed by the scheduler.
 */
function nodeConfig(n: { type: string; config?: Record<string, unknown> }): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaultNodeConfig(n.type), ...(n.config ?? {}) };
  if (n.type === "delay" || n.type === "wait") {
    merged.duration = 0;
    merged.unit = "seconds";
  }
  return merged;
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface TestResult {
  templateId: string;
  templateName: string;
  workflowCreated: boolean;
  executionStarted: boolean;
  executionStatus: string;
  nodeResults: { nodeId: string; nodeType: string; status: string; error?: string }[];
  totalMs: number;
  error?: string;
}

async function testTemplate(template: typeof allTemplates[0]): Promise<TestResult> {
  const result: TestResult = {
    templateId: template.id,
    templateName: template.name,
    workflowCreated: false,
    executionStarted: false,
    executionStatus: "UNKNOWN",
    nodeResults: [],
    totalMs: 0,
  };
  const start = Date.now();

  try {
    // Build nodes with default configs — use template-specific IDs to avoid collisions
    const nodes = template.nodes.map((n, i) => ({
      id: `${template.id}-n${i}`,
      type: n.type,
      name: n.label,
      config: nodeConfig(n),
      position: n.position,
    }));

    // Build edges with branch config from sourceHandle
    const edges = template.edges.map((e, i) => ({
      id: `${template.id}-e${i}`,
      sourceNodeId: `${template.id}-n${e.from}`,
      targetNodeId: `${template.id}-n${e.to}`,
      config: e.sourceHandle ? { branch: e.sourceHandle } : {},
    }));

    // Create workflow
    const wf = await api("POST", "/workflows", { name: template.name, nodes, edges }) as any;
    result.workflowCreated = true;
    const wfId = wf.workflow.id;

    // Execute
    const run = await api("POST", `/workflows/${wfId}/run`, { input: { trigger: { body: { test: true } } } }) as any;
    result.executionStarted = true;
    const execId = run.execution.id;

    // Poll for completion (max 30s)
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const exec = await api("GET", `/executions/${execId}`) as any;
      result.executionStatus = exec.execution.status;
      if (exec.execution.status === "SUCCESS" || exec.execution.status === "FAILED") {
        result.nodeResults = (exec.execution.nodeExecutions || []).map((ne: any) => ({
          nodeId: ne.nodeId,
          nodeType: ne.node?.type || "unknown",
          status: ne.status,
          error: ne.error || undefined,
        }));
        break;
      }
    }
  } catch (err: any) {
    result.error = err.message?.slice(0, 200);
    result.executionStatus = "ERROR";
  }

  result.totalMs = Date.now() - start;
  return result;
}

async function main() {
  // Start from a clean slate: remove workflows left by previous runs so their
  // deterministic node ids can't collide with this run's createMany.
  const pre = await cleanupTestWorkflows();
  if (pre) console.log(`🧹 Removed ${pre} workflow(s) from previous test runs.\n`);
  console.log(`\n🧪 Testing ${allTemplates.length} templates...\n`);
  console.log("─".repeat(120));

  const results: TestResult[] = [];
  let pass = 0;
  let fail = 0;

  for (const template of allTemplates) {
    process.stdout.write(`  Testing [${template.id}]... `);
    const r = await testTemplate(template);
    results.push(r);

    if (r.executionStatus === "SUCCESS") {
      const nodeOk = r.nodeResults.filter(n => n.status === "SUCCESS").length;
      const nodeFail = r.nodeResults.filter(n => n.status !== "SUCCESS").length;
      console.log(`✅ ${r.executionStatus} (${nodeOk}/${r.nodeResults.length} nodes OK, ${r.totalMs}ms)`);
      pass++;
    } else {
      console.log(`❌ ${r.executionStatus} — ${r.error || r.nodeResults.filter(n => n.status !== "SUCCESS").map(n => `${n.nodeId}(${n.status})`).join(", ")}`);
      fail++;
    }
  }

  console.log("─".repeat(120));
  console.log(`\n📊 Results: ${pass} passed, ${fail} failed out of ${allTemplates.length}`);

  // Print failures detail
  const failures = results.filter(r => r.executionStatus !== "SUCCESS");
  if (failures.length > 0) {
    console.log("\n❌ FAILED TEMPLATES:");
    for (const f of failures) {
      console.log(`\n  [${f.templateId}] ${f.templateName}`);
      console.log(`    Status: ${f.executionStatus}`);
      if (f.error) console.log(`    Error: ${f.error}`);
      for (const nr of f.nodeResults.filter(n => n.status !== "SUCCESS")) {
        console.log(`    Node ${nr.nodeId} (${nr.nodeType}): ${nr.status}${nr.error ? " — " + nr.error : ""}`);
      }
    }
  }
  // Leave the database clean — the test must not accumulate workflows.
  const removed = await cleanupTestWorkflows();
  if (removed) console.log(`\n🧹 Cleaned up ${removed} test workflow(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
