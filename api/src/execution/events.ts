export const EXECUTION_TOPIC = "flux-execution-events";
export const NODE_EXECUTION_REQUESTED_EVENT = "NODE_EXECUTION_REQUESTED";

export interface NodeExecutionEventPayload {
  eventId: string;
  workflowExecutionId: string;
  nodeExecutionId: string;
  workflowId: string;
  workflowVersion: number;
  nodeId: string;
  input: Record<string, unknown>;
}

export function isValidNodeExecutionEvent(payload: unknown): payload is NodeExecutionEventPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.eventId === "string" &&
    typeof obj.workflowExecutionId === "string" &&
    typeof obj.nodeExecutionId === "string" &&
    typeof obj.workflowId === "string" &&
    typeof obj.workflowVersion === "number" &&
    typeof obj.nodeId === "string" &&
    typeof obj.input === "object" &&
    obj.input !== null &&
    !Array.isArray(obj.input)
  );
}
