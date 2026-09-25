import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, WorkflowEdge } from "@prisma/client";
import { executeNodeStep } from "./core.js";
import { findEntryNode } from "./entry.js";
import { scheduleFailureAlert } from "./alerts.js";
import { NODE_EXECUTION_REQUESTED_EVENT, type NodeExecutionEventPayload } from "./events.js";

export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface ExecutionHandleResult {
  status: "PROCESSED" | "WAITING" | "SKIPPED_ALREADY_SUCCESS" | "SKIPPED_STALE_OR_DELETED" | "FAILED";
  nodeExecutionId: string;
  workflowCompleted?: boolean;
  workflowStatus?: "SUCCESS" | "FAILED";
  error?: string;
  nextEventsCreated: number;
}

type ScheduleContext = {
  workflowExecutionId: string;
  workflowId: string;
  workflowVersion: number;
  output: Prisma.JsonValue;
  nextEdges: WorkflowEdge[];
};

/**
 * Creates the next NodeExecution(s) + OutboxEvent(s) for each edge the current
 * node's output should flow into. Shared by the worker handler and the
 * scheduler's durable-wait wake-up path so both stay consistent.
 * Must run inside a transaction.
 */
export async function scheduleNextSteps(tx: PrismaTransaction, ctx: ScheduleContext): Promise<number> {
  let eventsCreated = 0;
  for (const edge of ctx.nextEdges) {
    // Join support: a node with multiple incoming edges is only scheduled
    // once. If a node execution for this target already exists for the
    // current attempt, reuse it instead of inserting a duplicate (which
    // would violate the unique constraint and deadlock the workflow).
    let nextNodeExec = await tx.nodeExecution.findFirst({
      where: { executionId: ctx.workflowExecutionId, nodeId: edge.targetNodeId, attempt: 0 },
    });

    if (nextNodeExec && nextNodeExec.status === "SUCCESS") {
      continue;
    }

    if (nextNodeExec && (nextNodeExec.status === "PENDING" || nextNodeExec.status === "RUNNING" || nextNodeExec.status === "WAITING")) {
      continue;
    }

    if (nextNodeExec) {
      // Previous attempt failed: retry with the next attempt number.
      nextNodeExec = await tx.nodeExecution.create({
        data: {
          executionId: ctx.workflowExecutionId,
          nodeId: edge.targetNodeId,
          input: ctx.output as Prisma.InputJsonValue,
          status: "PENDING",
          attempt: nextNodeExec.attempt + 1,
        },
      });
    } else {
      nextNodeExec = await tx.nodeExecution.create({
        data: {
          executionId: ctx.workflowExecutionId,
          nodeId: edge.targetNodeId,
          input: ctx.output as Prisma.InputJsonValue,
          status: "PENDING",
          attempt: 0,
        },
      });
    }

    const nextPayload: NodeExecutionEventPayload = {
      eventId: randomUUID(),
      workflowExecutionId: ctx.workflowExecutionId,
      nodeExecutionId: nextNodeExec.id,
      workflowId: ctx.workflowId,
      workflowVersion: ctx.workflowVersion,
      nodeId: edge.targetNodeId,
      input: ctx.output as Record<string, unknown>,
    };

    await tx.outboxEvent.create({
      data: {
        eventType: NODE_EXECUTION_REQUESTED_EVENT,
        aggregateId: ctx.workflowExecutionId,
        payload: nextPayload as unknown as Prisma.InputJsonValue,
      },
    });
    eventsCreated++;
  }
  return eventsCreated;
}

/**
 * The workflow completes when nothing else is left to run — no node is
 * PENDING, RUNNING, or WAITING (durable wait) besides the one just finished.
 * Must run inside a transaction.
 */
export async function tryCompleteWorkflow(tx: PrismaTransaction, workflowExecutionId: string, currentNodeExecutionId: string): Promise<boolean> {
  const remainingPendingOrRunning = await tx.nodeExecution.findMany({
    where: {
      executionId: workflowExecutionId,
      id: { not: currentNodeExecutionId },
      status: { in: ["PENDING", "RUNNING", "WAITING"] },
    },
  });

  if (remainingPendingOrRunning.length > 0) return false;

  await tx.workflowExecution.update({
    where: { id: workflowExecutionId },
    data: { status: "SUCCESS", completedAt: new Date() },
  });
  return true;
}

export async function handleNodeExecutionEvent(
  db: PrismaClient,
  eventPayload: NodeExecutionEventPayload
): Promise<ExecutionHandleResult> {
  const { nodeExecutionId, workflowExecutionId, workflowId, nodeId } = eventPayload;

  // 1. Load the node execution record
  const nodeExecution = await db.nodeExecution.findUnique({
    where: { id: nodeExecutionId },
    include: {
      node: true,
      execution: {
        include: {
          workflow: {
            include: {
              nodes: true,
              edges: true,
            },
          },
        },
      },
    },
  });

  // Stale or deleted workflow execution: acknowledge without crashing or looping
  if (!nodeExecution) {
    console.warn(
      `[distributed-handler] Stale or deleted execution event received: NodeExecution ${nodeExecutionId} (WorkflowExecution ${workflowExecutionId}, Node ${nodeId}) not found in PostgreSQL. Acknowledging event.`
    );
    return {
      status: "SKIPPED_STALE_OR_DELETED",
      nodeExecutionId,
      nextEventsCreated: 0,
    };
  }

  // Idempotency: If already SUCCESS, do not execute again.
  if (nodeExecution.status === "SUCCESS") {
    return {
      status: "SKIPPED_ALREADY_SUCCESS",
      nodeExecutionId,
      nextEventsCreated: 0,
    };
  }

  // The execution already terminated (a sibling branch failed): acknowledge
  // without running further nodes.
  if (nodeExecution.execution.status === "FAILED" || nodeExecution.execution.status === "CANCELLED") {
    await db.nodeExecution.update({
      where: { id: nodeExecutionId },
      data: { status: "SKIPPED", completedAt: new Date() },
    });
    return {
      status: "SKIPPED_STALE_OR_DELETED",
      nodeExecutionId,
      nextEventsCreated: 0,
    };
  }

  // Mark workflow RUNNING if PENDING
  if (nodeExecution.execution.status === "PENDING") {
    await db.workflowExecution.update({
      where: { id: workflowExecutionId },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  }

  // Mark node execution RUNNING
  await db.nodeExecution.update({
    where: { id: nodeExecutionId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const node = nodeExecution.node;
  const workflow = nodeExecution.execution.workflow;
  const outgoingEdges = workflow.edges.filter((e) => e.sourceNodeId === nodeId);
  const entry = findEntryNode({ nodes: workflow.nodes, edges: workflow.edges });

  // 2. Call reusable execution core (entry nodes pass their input through)
  const stepResult = await executeNodeStep(
    node,
    (nodeExecution.input ?? {}) as Prisma.JsonValue,
    outgoingEdges,
    entry?.id === nodeId
  );

  // 3. Atomically update state and create next NodeExecution(s) + OutboxEvent(s)
  try {
    const outcome = await db.$transaction(async (tx) => {
      if (stepResult.status === "FAILED") {
      await tx.nodeExecution.update({
        where: { id: nodeExecutionId },
        data: {
          status: "FAILED",
          error: stepResult.error ?? "Node execution failed.",
          completedAt: new Date(),
        },
      });

      await tx.workflowExecution.update({
        where: { id: workflowExecutionId },
        data: {
          status: "FAILED",
          error: stepResult.error ?? "Workflow execution failed.",
          completedAt: new Date(),
        },
      });

      return {
        status: "FAILED" as const,
        nodeExecutionId,
        workflowCompleted: true,
        workflowStatus: "FAILED" as const,
        error: stepResult.error,
        nextEventsCreated: 0,
      };
    }

    if (stepResult.status === "WAITING") {
      // Durable wait: park this node until the scheduler resumes it. The
      // workflow stays RUNNING; no next steps are scheduled yet.
      await tx.nodeExecution.update({
        where: { id: nodeExecutionId },
        data: {
          status: "WAITING",
          output: stepResult.output as Prisma.InputJsonValue,
        },
      });

      return {
        status: "WAITING" as const,
        nodeExecutionId,
        workflowCompleted: false,
        nextEventsCreated: 0,
      };
    }

    // Node SUCCESS
    await tx.nodeExecution.update({
      where: { id: nodeExecutionId },
      data: {
        status: "SUCCESS",
        output: stepResult.output as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    const eventsCreated = await scheduleNextSteps(tx, {
      workflowExecutionId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      output: (stepResult.output ?? {}) as Prisma.JsonValue,
      nextEdges: stepResult.nextEdges,
    });

    const completed = await tryCompleteWorkflow(tx, workflowExecutionId, nodeExecutionId);
    if (completed) {
      return {
        status: "PROCESSED" as const,
        nodeExecutionId,
        workflowCompleted: true,
        workflowStatus: "SUCCESS" as const,
        nextEventsCreated: eventsCreated,
      };
    }

    return {
      status: "PROCESSED" as const,
      nodeExecutionId,
      workflowCompleted: false,
      nextEventsCreated: eventsCreated,
    };
    });
    // Alert only AFTER the transaction committed — a rolled-back FAILED
    // transition must not notify. scheduleFailureAlert is exactly-once.
    if (outcome.status === "FAILED") scheduleFailureAlert(workflowExecutionId);
    return outcome;
  } catch (error) {
    // The row vanished mid-flight (e.g. the workflow was deleted between the
    // read at the top and this transactional write, cascading to its
    // NodeExecutions). Treat it exactly like the stale/deleted path above:
    // acknowledge the event instead of making Kafka redeliver it forever.
    if (
      error instanceof Error &&
      error.name === "PrismaClientKnownRequestError" &&
      (error as { code?: unknown }).code === "P2025"
    ) {
      console.warn(
        `[distributed-handler] NodeExecution ${nodeExecutionId} disappeared mid-flight (WorkflowExecution ${workflowExecutionId}). Acknowledging event.`
      );
      return {
        status: "SKIPPED_STALE_OR_DELETED",
        nodeExecutionId,
        nextEventsCreated: 0,
      };
    }
    throw error;
  }
}
