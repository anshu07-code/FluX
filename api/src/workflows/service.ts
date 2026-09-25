import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
import type { WorkflowInput } from "./schema.js";

export class WorkflowNotFoundError extends Error {}

const graphInclude = {
  nodes: { orderBy: { sortOrder: "asc" } as const },
  edges: { orderBy: { sortOrder: "asc" } as const },
} satisfies Prisma.WorkflowInclude;

function nodeData(workflowId: string, input: WorkflowInput) {
  return input.nodes.map((node, index) => ({
    id: node.id,
    workflowId,
    type: node.type,
    name: node.name,
    config: node.config as Prisma.InputJsonValue,
    position: node.position as Prisma.InputJsonValue,
    sortOrder: index,
  }));
}

function edgeData(workflowId: string, input: WorkflowInput) {
  return input.edges.map((edge, index) => ({
    id: edge.id,
    workflowId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    config: edge.config as Prisma.InputJsonValue,
    sortOrder: index,
  }));
}

async function findOwnedWorkflow(client: PrismaClient, id: string, userId: string) {
  return client.workflow.findFirst({ where: { id, userId } });
}

function isIdCollision(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function freshId(used: ReadonlySet<string>): string {
  for (;;) {
    const id = randomUUID();
    if (!used.has(id)) return id;
  }
}

/**
 * Node and edge ids are client-supplied so the canvas stays stable across
 * saves — but that breaks when an external integration (or a retried request)
 * re-posts ids that are already stored for another workflow: `createMany`
 * fails with P2002 and the whole save is rejected. Regenerate any id that is
 * already taken (globally, or repeated inside one payload) and repoint edges
 * at the new node ids, so saving can never fail because of id reuse.
 * `keepNodeIds` are ids that belong to the workflow being updated and must be
 * preserved — they are what keeps execution history attached to its nodes.
 */
async function normalizeGraphIds(
  tx: Prisma.TransactionClient,
  input: WorkflowInput,
  keepNodeIds: ReadonlySet<string> = new Set()
): Promise<WorkflowInput> {
  const payloadNodeIds = input.nodes.map((node) => node.id);
  const nodeCollisions = payloadNodeIds.length
    ? await tx.workflowNode.findMany({
        where: {
          id: { in: payloadNodeIds },
          ...(keepNodeIds.size ? { NOT: { id: { in: [...keepNodeIds] } } } : {}),
        },
        select: { id: true },
      })
    : [];
  const takenNodeIds = new Set(nodeCollisions.map((row) => row.id));

  const seenNodeIds = new Set<string>();
  const nodeIdMap = new Map<string, string>();
  const nodes = input.nodes.map((node) => {
    let id = node.id;
    if (seenNodeIds.has(id) || takenNodeIds.has(id)) {
      id = freshId(new Set([...seenNodeIds, ...takenNodeIds]));
    }
    seenNodeIds.add(id);
    if (id !== node.id) nodeIdMap.set(node.id, id);
    return { ...node, id };
  });

  const payloadEdgeIds = input.edges.map((edge) => edge.id);
  const edgeCollisions = payloadEdgeIds.length
    ? await tx.workflowEdge.findMany({ where: { id: { in: payloadEdgeIds } }, select: { id: true } })
    : [];
  const takenEdgeIds = new Set(edgeCollisions.map((row) => row.id));
  const seenEdgeIds = new Set<string>();
  const edges = input.edges.map((edge) => {
    let id = edge.id;
    if (seenEdgeIds.has(id) || takenEdgeIds.has(id)) {
      id = freshId(new Set([...seenEdgeIds, ...takenEdgeIds]));
    }
    seenEdgeIds.add(id);
    return {
      ...edge,
      id,
      sourceNodeId: nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId,
    };
  });

  return { ...input, nodes, edges };
}

/**
 * Two saves racing each other can both pass the collision check and then hit
 * the unique constraint on insert. The failed transaction rolled back, so
 * re-running it re-normalizes against the winner's committed rows and
 * succeeds with regenerated ids.
 */
async function withCollisionRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isIdCollision(error)) throw error;
    return run();
  }
}

export async function createWorkflow(input: WorkflowInput, userId: string) {
  return withCollisionRetry(() =>
    prisma.$transaction(async (tx) => {
      const graph = await normalizeGraphIds(tx, input);
      const workflow = await tx.workflow.create({
        data: { name: input.name, userId },
      });

      if (graph.nodes.length) await tx.workflowNode.createMany({ data: nodeData(workflow.id, graph) });
      if (graph.edges.length) await tx.workflowEdge.createMany({ data: edgeData(workflow.id, graph) });

      await tx.activityLog.create({
        data: { userId, action: "WORKFLOW_CREATE", resource: "workflow", resourceId: workflow.id, details: { name: workflow.name } },
      });

      return tx.workflow.findUniqueOrThrow({ where: { id: workflow.id }, include: graphInclude });
    })
  );
}

export async function listWorkflows(userId: string) {
  return prisma.workflow.findMany({
    where: { userId },
    include: graphInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getWorkflow(id: string, userId: string) {
  const workflow = await prisma.workflow.findFirst({ where: { id, userId }, include: graphInclude });
  if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");
  return workflow;
}

export async function updateWorkflow(id: string, input: WorkflowInput, userId: string) {
  return withCollisionRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await findOwnedWorkflow(tx as PrismaClient, id, userId);
      if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");

      const existingNodes = await tx.workflowNode.findMany({ where: { workflowId: id } });
      const existingNodeIds = new Set(existingNodes.map((node) => node.id));
      // Ids already on this workflow are preserved (execution history hangs off
      // them); brand-new ids that collide with another workflow get regenerated.
      const graph = await normalizeGraphIds(tx, input, existingNodeIds);
      const incomingNodeIds = new Set(graph.nodes.map((node) => node.id));

      // Edges carry no execution FKs — safe to rebuild wholesale.
      await tx.workflowEdge.deleteMany({ where: { workflowId: id } });

      // Remove only nodes dropped from the graph. NodeExecution and DeadLetterEvent
      // reference nodes with onDelete: Restrict, so clear their per-node rows first.
      // Surviving nodes keep their ids — that is what preserves execution history
      // across saves (previously every save wiped the entire execution log).
      const removedNodeIds = [...existingNodeIds].filter((nodeId) => !incomingNodeIds.has(nodeId));
      if (removedNodeIds.length) {
        await tx.deadLetterEvent.deleteMany({ where: { nodeId: { in: removedNodeIds } } });
        await tx.nodeExecution.deleteMany({ where: { nodeId: { in: removedNodeIds } } });
        await tx.workflowNode.deleteMany({ where: { id: { in: removedNodeIds } } });
      }

      // Update surviving nodes in place; insert brand-new ones.
      for (const [index, node] of graph.nodes.entries()) {
      const data = {
        type: node.type,
        name: node.name,
        config: node.config as Prisma.InputJsonValue,
        position: node.position as Prisma.InputJsonValue,
        sortOrder: index,
      };
      if (existingNodeIds.has(node.id)) {
        await tx.workflowNode.update({ where: { id: node.id }, data });
      } else {
        await tx.workflowNode.create({ data: { id: node.id, workflowId: id, ...data } });
      }
    }

    const updated = await tx.workflow.update({
      where: { id },
      data: { name: input.name, version: { increment: 1 } },
    });
    if (graph.edges.length) await tx.workflowEdge.createMany({ data: edgeData(id, graph) });

    await tx.activityLog.create({
      data: { userId, action: "WORKFLOW_UPDATE", resource: "workflow", resourceId: id, details: { name: updated.name } },
    });

    return tx.workflow.findUniqueOrThrow({ where: { id }, include: graphInclude });
    })
  );
}

export async function deleteWorkflow(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const workflow = await findOwnedWorkflow(tx as PrismaClient, id, userId);
    if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");

    await tx.activityLog.create({
      data: { userId, action: "WORKFLOW_DELETE", resource: "workflow", resourceId: id },
    });

    // Explicitly remove executions first. Their node executions and dead-letter
    // records cascade from the execution relation; nodes and edges cascade from Workflow.
    await tx.workflowExecution.deleteMany({ where: { workflowId: id } });
    await tx.workflow.delete({ where: { id } });
  });
}

export async function updateWorkflowStatus(
  id: string,
  status: "ACTIVE" | "DRAFT" | "ARCHIVED",
  userId: string
) {
  const workflow = await findOwnedWorkflow(prisma, id, userId);
  if (!workflow) throw new WorkflowNotFoundError("Workflow not found.");

  return prisma.workflow.update({
    where: { id },
    data: { status },
    include: graphInclude,
  });
}
