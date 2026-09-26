import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { WorkflowNotFoundError } from "../workflows/service.js";
import { validateExecutableGraph } from "./graph-validation.js";
import { determineNextEdges, executeNodeStep } from "./core.js";
import { findEntryNode } from "./entry.js";
import { stripWaitMarker, waitUntilOf } from "./node-executors.js";
import { scheduleNextSteps, tryCompleteWorkflow } from "./distributed-handler.js";
import { scheduleFailureAlert } from "./alerts.js";
import { NODE_EXECUTION_REQUESTED_EVENT, type NodeExecutionEventPayload } from "./events.js";

const executionInclude = {
  workflow: { select: { id: true, name: true, version: true } },
  nodeExecutions: { include: { node: { select: { id: true, name: true, type: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.WorkflowExecutionInclude;

const graphInclude = {
  nodes: { orderBy: { sortOrder: "asc" as const } },
  edges: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.WorkflowInclude;

type StartOptions = { idempotencyKey?: string; input: Record<string, unknown> };

export async function startWorkflow(workflowId: string, options: StartOptions, userId: string) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId }, include: graphInclude });
  if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");

  const idempotencyKey = options.idempotencyKey ?? randomUUID();
  const existing = await prisma.workflowExecution.findUnique({
    where: { workflowId_idempotencyKey: { workflowId, idempotencyKey } },
    include: executionInclude,
  });
  if (existing) return { execution: existing, started: false, invalid: false };

  const validationErrors = validateExecutableGraph(workflow);
  if (validationErrors.length) {
    const execution = await prisma.workflowExecution.create({
      data: { workflowId, workflowVersion: workflow.version, status: "FAILED", idempotencyKey, error: validationErrors.join(" "), startedAt: new Date(), completedAt: new Date() },
      include: executionInclude,
    });
    scheduleFailureAlert(execution.id);
    return { execution, started: false, invalid: true };
  }

  // Validation guarantees an entry node exists.
  const entry = findEntryNode(workflow)!;
  const executionMode = process.env.EXECUTION_MODE?.toLowerCase();

  const execution = await prisma.$transaction(async (tx) => {
    const created = await tx.workflowExecution.create({
      data: { workflowId, workflowVersion: workflow.version, status: "PENDING", idempotencyKey },
    });
    const nodeExec = await tx.nodeExecution.create({
      data: { executionId: created.id, nodeId: entry.id, input: options.input as Prisma.InputJsonValue, status: "PENDING", attempt: 0 },
    });

    if (executionMode === "distributed") {
      const payload: NodeExecutionEventPayload = {
        eventId: randomUUID(),
        workflowExecutionId: created.id,
        nodeExecutionId: nodeExec.id,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        nodeId: entry.id,
        input: options.input,
      };

      await tx.outboxEvent.create({
        data: {
          eventType: NODE_EXECUTION_REQUESTED_EVENT,
          aggregateId: created.id,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await tx.activityLog.create({
      data: { userId: workflow.userId, action: "WORKFLOW_RUN", resource: "execution", resourceId: created.id, details: { workflowName: workflow.name } },
    });

    return tx.workflowExecution.findUniqueOrThrow({ where: { id: created.id }, include: executionInclude });
  });

  if (executionMode !== "distributed") {
    setImmediate(() => { void runExecution(execution.id).catch((err) => console.error("[runExecution] unhandled error:", err)); });
  }

  return { execution, started: true, invalid: false };
}

type ExecutionWithGraph = NonNullable<
  Awaited<ReturnType<typeof loadExecution>>
>;

async function loadExecution(executionId: string) {
  return prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: { include: graphInclude }, nodeExecutions: true },
  });
}

type Step = { nodeId: string; input: Prisma.JsonValue | undefined; isEntry?: boolean };

/**
 * Walks the execution graph from the given steps, persisting every node's
 * state. Returns:
 *   - "SUCCESS"  — everything ran; execution marked SUCCESS
 *   - "WAITING"  — at least one durable wait parked; execution left RUNNING
 *   - "FAILED"   — a node threw; execution marked FAILED
 */
async function walkSteps(executionId: string, execution: ExecutionWithGraph, steps: Step[]): Promise<"SUCCESS" | "WAITING" | "FAILED"> {
  const nodes = new Map(execution.workflow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof execution.workflow.edges>();
  for (const edge of execution.workflow.edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
  const existing = new Map(execution.nodeExecutions.map((record) => [record.nodeId, record]));
  const visited = new Set<string>();

  let failed = false;
  let waiting = false;

  const executeFrom = async (nodeId: string, input: Prisma.JsonValue | undefined, isEntry: boolean): Promise<void> => {
    if (visited.has(nodeId) || failed) return;
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) throw new Error("Execution graph references an unknown node.");
    let record = existing.get(nodeId);
    if (!record) {
      record = await prisma.nodeExecution.create({ data: { executionId, nodeId, input: (input ?? {}) as Prisma.InputJsonValue, status: "PENDING", attempt: 0 } });
      existing.set(nodeId, record);
    }
    await prisma.nodeExecution.update({ where: { id: record.id }, data: { status: "RUNNING", input: (input ?? {}) as Prisma.InputJsonValue, startedAt: new Date() } });

    const nodeOutgoing = outgoing.get(nodeId) ?? [];
    const stepResult = await executeNodeStep(node, input, nodeOutgoing, isEntry, { ownerId: execution.workflow.userId });

    if (stepResult.status === "SUCCESS") {
      await prisma.nodeExecution.update({ where: { id: record.id }, data: { status: "SUCCESS", output: stepResult.output as Prisma.InputJsonValue, completedAt: new Date() } });
      await Promise.all(stepResult.nextEdges.map((edge) => executeFrom(edge.targetNodeId, stepResult.output, false)));
    } else if (stepResult.status === "WAITING") {
      // Durable wait: park the node (no completedAt) and leave the execution
      // RUNNING. The scheduler resumes it at the marker timestamp.
      waiting = true;
      await prisma.nodeExecution.update({ where: { id: record.id }, data: { status: "WAITING", output: stepResult.output as Prisma.InputJsonValue } });
    } else {
      failed = true;
      await prisma.nodeExecution.update({ where: { id: record.id }, data: { status: "FAILED", error: stepResult.error, completedAt: new Date() } });
      throw new Error(stepResult.error ?? "Node execution failed.");
    }
  };

  try {
    for (const step of steps) await executeFrom(step.nodeId, step.input, step.isEntry ?? false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow execution failed.";
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    scheduleFailureAlert(executionId);
    return "FAILED";
  }

  if (waiting) return "WAITING";

  await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: "SUCCESS", completedAt: new Date() } });
  return "SUCCESS";
}

export async function runExecution(executionId: string) {
  const execution = await loadExecution(executionId);
  if (!execution || execution.status !== "PENDING") return;

  await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: "RUNNING", startedAt: new Date() } });

  const entry = findEntryNode(execution.workflow);
  if (!entry) {
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: "FAILED", error: "Workflow has no entry node.", completedAt: new Date() } });
    scheduleFailureAlert(executionId);
    return;
  }

  await walkSteps(executionId, execution, [
    { nodeId: entry.id, input: execution.nodeExecutions.find((record) => record.nodeId === entry.id)?.input, isEntry: true },
  ]);
}

/**
 * Resumes a durable WAITING node once its timestamp is due. Atomically claims
 * the node (safe with multiple schedulers), marks it SUCCESS, and continues the
 * graph — inline for local mode, via outbox events for distributed mode.
 * Returns true when a resume actually happened.
 */
export async function resumeWaitingExecution(nodeExecutionId: string): Promise<boolean> {
  const record = await prisma.nodeExecution.findUnique({
    where: { id: nodeExecutionId },
    include: { execution: { include: { workflow: { include: graphInclude }, nodeExecutions: true } } },
  });
  if (!record || record.status !== "WAITING") return false;

  // Never resume into a terminated execution (a sibling branch already failed).
  const executionStatus = record.execution.status;
  if (executionStatus !== "RUNNING" && executionStatus !== "PENDING") {
    await prisma.nodeExecution.updateMany({ where: { id: nodeExecutionId, status: "WAITING" }, data: { status: "SKIPPED", completedAt: new Date() } });
    return false;
  }

  // Atomic claim — with concurrent schedulers only one caller wins.
  const claim = await prisma.nodeExecution.updateMany({
    where: { id: nodeExecutionId, status: "WAITING" },
    data: { status: "RUNNING" },
  });
  if (claim.count === 0) return false;

  const node = record.execution.workflow.nodes.find((item) => item.id === record.nodeId);
  if (!node) {
    // The node was removed from the graph while parked — we already claimed it
    // (WAITING → RUNNING), so terminate instead of leaving a zombie RUNNING node.
    await prisma.nodeExecution.update({
      where: { id: nodeExecutionId },
      data: { status: "FAILED", error: "Node no longer exists in the workflow graph — cannot resume.", completedAt: new Date() },
    });
    await prisma.workflowExecution.updateMany({
      where: { id: record.executionId, status: { in: ["RUNNING", "PENDING"] } },
      data: { status: "FAILED", error: "A waiting node was removed from the workflow graph before its resume time.", completedAt: new Date() },
    }).then((updated) => {
      if (updated.count > 0) scheduleFailureAlert(record.executionId);
    });
    return false;
  }

  const outgoing = record.execution.workflow.edges.filter((edge) => edge.sourceNodeId === record.nodeId);
  const output = record.output ?? {};
  const nextEdges = determineNextEdges(node, output, outgoing);
  const downstreamInput = stripWaitMarker(output);

  await prisma.nodeExecution.update({
    where: { id: nodeExecutionId },
    data: { status: "SUCCESS", output: output as Prisma.InputJsonValue, completedAt: new Date() },
  });

  const executionMode = process.env.EXECUTION_MODE?.toLowerCase();
  if (executionMode === "distributed") {
    await prisma.$transaction(async (tx) => {
      const workflow = record.execution.workflow;
      await scheduleNextSteps(tx, {
        workflowExecutionId: record.executionId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        output: downstreamInput,
        nextEdges,
      });
      await tryCompleteWorkflow(tx, record.executionId, nodeExecutionId);
    });
    return true;
  }

  // Local mode: continue walking the graph in this process.
  const execution = await loadExecution(record.executionId);
  if (!execution) return false;
  await walkSteps(
    record.executionId,
    execution,
    nextEdges.map((edge) => ({ nodeId: edge.targetNodeId, input: downstreamInput }))
  );
  return true;
}

/**
 * Poll for durable waiters whose resume time has passed and wake them.
 * Called on the scheduler's poll loop. Returns the number of resumed nodes.
 */
export async function wakeDueWaiters(): Promise<number> {
  const now = Date.now();
  const due = await prisma.nodeExecution.findMany({ where: { status: "WAITING" }, take: 100 });
  let woken = 0;
  for (const record of due) {
    const resumeAt = waitUntilOf(record.output as Prisma.JsonValue);
    // Missing/invalid markers are treated as due so executions can't get stuck.
    if (resumeAt && Date.parse(resumeAt) > now) continue;
    if (await resumeWaitingExecution(record.id)) woken++;
  }
  return woken;
}

export async function getExecution(executionId: string, userId: string) {
  const execution = await prisma.workflowExecution.findFirst({ where: { id: executionId, workflow: { userId } }, include: executionInclude });
  if (!execution) throw new WorkflowNotFoundError("Execution not found.");
  return execution;
}

export async function listWorkflowExecutions(workflowId: string, userId: string) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");
  return prisma.workflowExecution.findMany({ where: { workflowId }, include: executionInclude, orderBy: { createdAt: "desc" }, take: 20 });
}
