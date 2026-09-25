import cron from "node-cron";
import { prisma } from "../../api/src/db.js";
import { assertDatabaseReachable, validateServiceEnv } from "../../api/src/config.js";
import { startWorkflow, wakeDueWaiters } from "../../api/src/execution/service.js";
import { findEntryNode } from "../../api/src/execution/entry.js";
import { shouldFireNow } from "./cron.js";

const POLL_INTERVAL_MS = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 15_000);

type WorkflowWithNodes = Awaited<ReturnType<typeof prisma.workflow.findFirst>> & {
  nodes: Array<{ id: string; type: string; config: unknown }>;
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>;
};

function extractCronExpression(workflow: WorkflowWithNodes): string | null {
  const entry = findEntryNode(workflow);
  if (!entry) return null;

  const trigger = workflow.nodes.find((node) => node.id === entry.id);
  const config =
    trigger?.config && typeof trigger.config === "object" && !Array.isArray(trigger.config)
      ? (trigger.config as Record<string, unknown>)
      : {};

  if (config.triggerType !== "cron") return null;

  const expr = typeof config.cronExpression === "string" ? config.cronExpression.trim() : "";
  if (!expr) return null;

  return expr;
}

async function checkAndTriggerDueWorkflows() {
  let workflows: WorkflowWithNodes[];
  try {
    workflows = await prisma.workflow.findMany({
      where: { status: "ACTIVE" },
      include: {
        nodes: {
          select: { id: true, type: true, config: true },
          orderBy: { sortOrder: "asc" },
        },
        edges: {
          select: { sourceNodeId: true, targetNodeId: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  } catch (err) {
    console.error("[scheduler] Failed to query workflows:", err);
    return;
  }

  const now = new Date();
  let triggeredCount = 0;

  for (const workflow of workflows) {
    const cronExpr = extractCronExpression(workflow);
    if (!cronExpr) continue;

    if (!shouldFireNow(cronExpr, now, workflow.lastScheduledRunAt)) continue;

    // Validate cron expression syntax
    if (!cron.validate(cronExpr)) {
      console.warn(`[scheduler] Invalid cron "${cronExpr}" in workflow ${workflow.id} — skipping.`);
      continue;
    }

    console.log(`[scheduler] Triggering workflow "${workflow.name}" (${workflow.id}) — cron: ${cronExpr}`);

    try {
      await startWorkflow(
        workflow.id,
        { idempotencyKey: `cron-${workflow.id}-${now.toISOString()}`, input: {} },
        workflow.userId
      );

      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { lastScheduledRunAt: now },
      });

      triggeredCount++;
    } catch (err) {
      console.error(
        `[scheduler] Failed to trigger workflow "${workflow.name}" (${workflow.id}):`,
        err
      );
    }
  }

  if (triggeredCount > 0) {
    console.log(`[scheduler] Triggered ${triggeredCount} workflow(s).`);
  }
}

/** Resume durable waits (delay nodes > 30s) whose timestamp has passed. */
async function checkDueWaits() {
  try {
    const woken = await wakeDueWaiters();
    if (woken > 0) console.log(`[scheduler] Resumed ${woken} waiting node(s).`);
  } catch (err) {
    console.error("[scheduler] Failed to resume waiting nodes:", err);
  }
}

async function tick() {
  await checkAndTriggerDueWorkflows();
  await checkDueWaits();
}

async function main() {
  console.log("[scheduler] Starting FluX Scheduler...");

  // Fail fast on missing config / unreachable database before polling.
  try {
    validateServiceEnv("scheduler");
    await assertDatabaseReachable(prisma);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`[scheduler] Polling every ${POLL_INTERVAL_MS}ms for cron-scheduled workflows and durable waits.`);

  // Run immediately on startup
  await tick();

  // Then poll on interval
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[scheduler] Fatal:", err);
  process.exit(1);
});