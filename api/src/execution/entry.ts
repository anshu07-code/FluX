/**
 * The entry node is a workflow's single start point:
 *   - a `trigger` node when one exists, otherwise
 *   - a `webhook` node with no incoming edges (legacy template workflows used
 *     a webhook node as their entry; mid-graph webhook nodes with incoming
 *     edges are outgoing webhook *actions*).
 *
 * Accepts structural subsets so partial Prisma selects (scheduler) also work.
 */
type EntryNode = { id: string; type: string };
type EntryEdge = { targetNodeId: string };

export function findEntryNode(graph: { nodes: readonly EntryNode[]; edges: readonly EntryEdge[] }): EntryNode | null {
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (trigger) return trigger;
  const targets = new Set(graph.edges.map((edge) => edge.targetNodeId));
  const entryWebhooks = graph.nodes.filter((node) => node.type === "webhook" && !targets.has(node.id));
  return entryWebhooks.length === 1 ? entryWebhooks[0] : null;
}
