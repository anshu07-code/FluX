import { z } from "zod";

const jsonObject = z.record(z.string(), z.unknown());

export const workflowNodeInputSchema = z.object({
  id: z.string().min(1).max(191),
  type: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  config: jsonObject.default({}),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

export const workflowEdgeInputSchema = z.object({
  id: z.string().min(1).max(191),
  sourceNodeId: z.string().min(1).max(191),
  targetNodeId: z.string().min(1).max(191),
  config: jsonObject.default({}),
});

export const workflowInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  nodes: z.array(workflowNodeInputSchema).max(500),
  edges: z.array(workflowEdgeInputSchema).max(2_000),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export function validateGraph(input: WorkflowInput) {
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  if (nodeIds.size !== input.nodes.length) {
    return "Node ids must be unique.";
  }

  const edgeIds = new Set(input.edges.map((edge) => edge.id));
  if (edgeIds.size !== input.edges.length) {
    return "Edge ids must be unique.";
  }

  const connections = new Set<string>();
  for (const edge of input.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      return "Every edge must reference nodes in the submitted workflow.";
    }
    const connection = `${edge.sourceNodeId}:${edge.targetNodeId}`;
    if (connections.has(connection)) {
      return "Duplicate node connections are not allowed.";
    }
    connections.add(connection);
  }

  return null;
}
