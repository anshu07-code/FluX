import type { WorkflowEdge, WorkflowNode } from "@prisma/client";
import { findEntryNode } from "./entry.js";

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

export function validateExecutableGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  // Exactly one entry point: a Trigger node, or a single incoming-less Webhook
  // node (legacy template workflows). Mid-graph webhook actions are allowed.
  const entry = findEntryNode(graph);
  if (!entry) {
    errors.push("A workflow must have exactly one Trigger or entry Webhook node.");
  }

  const connections = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) errors.push(`Edge ${edge.id} references a missing node.`);
    if (edge.sourceNodeId === edge.targetNodeId) errors.push(`Edge ${edge.id} cannot be a self-loop.`);
    const key = `${edge.sourceNodeId}:${edge.targetNodeId}`;
    if (connections.has(key)) errors.push(`Duplicate connection ${key}.`);
    connections.add(key);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const targetId of adjacency.get(nodeId) ?? []) if (visit(targetId)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if (graph.nodes.some((node) => visit(node.id))) errors.push("Workflow graph cannot contain a cycle.");

  if (entry) {
    const reachable = new Set<string>();
    const queue = [entry.id];
    while (queue.length) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      queue.push(...(adjacency.get(nodeId) ?? []));
    }
    for (const node of graph.nodes) if (node.id !== entry.id && !reachable.has(node.id)) errors.push(`Node ${node.name} is not reachable from the Trigger.`);
  }

  return errors;
}
