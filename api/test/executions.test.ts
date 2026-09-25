import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";

const createdWorkflowIds: string[] = [];
const suffix = `${Date.now()}`;

function node(id: string, type: string, config: Record<string, unknown> = {}) {
  return { id: `${suffix}-${id}`, type, name: type, config: { label: type, type, ...config }, position: { x: 0, y: 0 } };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, config: Record<string, unknown> = {}) {
  return { id: `${suffix}-${id}`, sourceNodeId: `${suffix}-${sourceNodeId}`, targetNodeId: `${suffix}-${targetNodeId}`, config };
}

async function createGraph(name: string, nodes: object[], edges: object[]) {
  const response = await request(app).post("/workflows").send({ name: `${name}-${suffix}`, nodes, edges }).expect(201);
  createdWorkflowIds.push(response.body.workflow.id);
  return response.body.workflow.id as string;
}

async function runAndWait(workflowId: string, input: Record<string, unknown> = {}) {
  const started = await request(app).post(`/workflows/${workflowId}/run`).send({ input }).expect(202);
  const executionId = started.body.execution.id as string;
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await request(app).get(`/executions/${executionId}`).expect(200);
    if (!["PENDING", "RUNNING"].includes(response.body.execution.status)) return response.body.execution;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Execution did not finish in time.");
}

describe("graph execution engine", () => {
  it("executes a successful linear workflow and exposes its status", async () => {
    const workflowId = await createGraph("linear", [
      node("trigger", "trigger"),
      node("http", "http", { url: "https://example.com", method: "GET", mockResponse: { value: 8 } }),
      node("ai", "ai"),
      node("email", "email", { recipient: "test@example.com" }),
    ], [edge("trigger-http", "trigger", "http"), edge("http-ai", "http", "ai"), edge("ai-email", "ai", "email")]);

    const execution = await runAndWait(workflowId);
    expect(execution.status).toBe("SUCCESS");
    expect(execution.nodeExecutions).toHaveLength(4);
    expect(execution.nodeExecutions.every((item: { status: string }) => item.status === "SUCCESS")).toBe(true);
  });

  it("records a failed execution for a graph without a trigger", async () => {
    const workflowId = await createGraph("no-trigger", [node("email-only", "email")], []);
    const response = await request(app).post(`/workflows/${workflowId}/run`).send({}).expect(422);
    expect(response.body.execution.status).toBe("FAILED");
    expect(response.body.execution.error).toContain("exactly one Trigger");
  });

  it("rejects a graph containing a cycle", async () => {
    const workflowId = await createGraph("cycle", [node("trigger-cycle", "trigger"), node("http-cycle", "http", { url: "https://example.com", mockResponse: {} })], [edge("trigger-http-cycle", "trigger-cycle", "http-cycle"), edge("http-trigger-cycle", "http-cycle", "trigger-cycle")]);
    const response = await request(app).post(`/workflows/${workflowId}/run`).send({}).expect(422);
    expect(response.body.execution.error).toContain("cycle");
  });

  it("follows only the matching condition branch", async () => {
    const workflowId = await createGraph("condition", [
      node("trigger-condition", "trigger"),
      node("condition", "condition", { inputPath: "value", operator: ">", value: 5 }),
      node("email-true", "email"),
      node("email-false", "email"),
    ], [
      edge("trigger-condition", "trigger-condition", "condition"),
      edge("condition-true", "condition", "email-true", { branch: "true" }),
      edge("condition-false", "condition", "email-false", { branch: "false" }),
    ]);
    const execution = await runAndWait(workflowId, { value: 10 });
    expect(execution.status).toBe("SUCCESS");
    expect(execution.nodeExecutions.map((item: { node: { id: string } }) => item.node.id)).toContain(`${suffix}-email-true`);
    expect(execution.nodeExecutions.map((item: { node: { id: string } }) => item.node.id)).not.toContain(`${suffix}-email-false`);
  });

  it("marks the workflow failed when a node fails", async () => {
    const workflowId = await createGraph("failure", [node("trigger-failure", "trigger"), node("http-failure", "http", { url: "http://localhost/internal" })], [edge("trigger-http-failure", "trigger-failure", "http-failure")]);
    const execution = await runAndWait(workflowId);
    expect(execution.status).toBe("FAILED");
    expect(execution.nodeExecutions.find((item: { node: { id: string } }) => item.node.id === `${suffix}-http-failure`).status).toBe("FAILED");
  });
});

afterAll(async () => {
  for (const workflowId of createdWorkflowIds) await request(app).delete(`/workflows/${workflowId}`);
});
