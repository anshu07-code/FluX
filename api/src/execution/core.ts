import type { Prisma, WorkflowEdge, WorkflowNode } from "@prisma/client";
import { executeNode, waitUntilOf } from "./node-executors.js";

/**
 * Node types that expose more than one output and must route based on their
 * result (condition -> true/false, switch -> case1/case2/default, filter ->
 * matching, auth -> main/denied, ...).
 */
const BRANCHING_NODE_TYPES = new Set([
  "condition",
  "switch",
  "filter",
  "auth",
  "error",
  "loop",
  "approval",
  "idempotency",
]);

function edgeBranch(edge: WorkflowEdge): string | undefined {
  const config = edge.config && typeof edge.config === "object" && !Array.isArray(edge.config) ? (edge.config as Record<string, unknown>) : {};
  const branch = config.branch;
  if (typeof branch !== "string" || branch.length === 0 || branch === "main") return undefined;
  return branch.toLowerCase();
}

function outputBranch(node: WorkflowNode, output: Prisma.JsonValue): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  if (node.type === "condition") {
    return typeof record.result === "boolean" ? (record.result ? "true" : "false") : undefined;
  }
  if (typeof record.branch === "string" && record.branch.length > 0) return record.branch.toLowerCase();
  return undefined;
}

export function determineNextEdges(
  node: WorkflowNode,
  output: Prisma.JsonValue,
  outgoingEdges: WorkflowEdge[]
): WorkflowEdge[] {
  if (!BRANCHING_NODE_TYPES.has(node.type) || outgoingEdges.length === 0) {
    return outgoingEdges;
  }

  const branch = outputBranch(node, output);

  if (branch === undefined) {
    // No usable branch value: follow edges without a branch label, or all edges if none are labeled.
    const unbranched = outgoingEdges.filter((edge) => edgeBranch(edge) === undefined);
    return unbranched.length > 0 ? unbranched : outgoingEdges;
  }

  const matching = outgoingEdges.filter((edge) => edgeBranch(edge) === branch);
  if (matching.length > 0) return matching;

  // The evaluated branch has no outgoing connection: follow unlabeled
  // ("main") edges as a default path. NEVER fall back to the OTHER labelled
  // branches — that would fan the graph out and execute mutually exclusive
  // paths together (e.g. a switch's case1 AND case2). A branching node whose
  // branch is not wired simply ends that path, same as a terminal node.
  return outgoingEdges.filter((edge) => edgeBranch(edge) === undefined);
}

export interface NodeExecutionStepResult {
  nodeId: string;
  status: "SUCCESS" | "FAILED" | "WAITING";
  output?: Prisma.JsonValue;
  error?: string;
  nextEdges: WorkflowEdge[];
  /** ISO timestamp a WAITING node should resume at (only when status is WAITING). */
  waitUntil?: string;
}

/**
 * @param isEntry true for the workflow's entry node — it passes its input
 *   through untouched instead of running an action (a webhook-type entry is an
 *   *inbound* trigger, so it must not fire an outgoing HTTP request).
 */
export async function executeNodeStep(
  node: WorkflowNode,
  input: Prisma.JsonValue | undefined,
  outgoingEdges: WorkflowEdge[],
  isEntry = false
): Promise<NodeExecutionStepResult> {
  try {
    const output = isEntry ? (input ?? {}) : await executeNode(node, input);
    if (!isEntry && (node.type === "delay" || node.type === "wait")) {
      // Durable wait: pause the graph here; the scheduler resumes it at waitUntil.
      const waitUntil = waitUntilOf(output);
      if (waitUntil) return { nodeId: node.id, status: "WAITING", output, nextEdges: [], waitUntil };
    }
    const nextEdges = determineNextEdges(node, output, outgoingEdges);
    return {
      nodeId: node.id,
      status: "SUCCESS",
      output,
      nextEdges,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Node execution failed.";
    return {
      nodeId: node.id,
      status: "FAILED",
      error: message,
      nextEdges: [],
    };
  }
}
