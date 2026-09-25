import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const testName = `Workflow API test ${Date.now()}`;
let workflowId = "";

const initialGraph = {
  name: testName,
  nodes: [
    { id: "trigger-node", type: "trigger", name: "Trigger", config: { label: "Trigger", type: "trigger" }, position: { x: 20, y: 30 } },
    { id: "email-node", type: "email", name: "Email", config: { label: "Email", type: "email", subject: "Hello" }, position: { x: 250, y: 30 } },
  ],
  edges: [{ id: "trigger-to-email", sourceNodeId: "trigger-node", targetNodeId: "email-node" }],
};

describe("workflow persistence API", () => {
  it("creates and lists a workflow for the development user", async () => {
    const created = await request(app).post("/workflows").send(initialGraph).expect(201);
    workflowId = created.body.workflow.id;
    expect(created.body.workflow.nodes).toHaveLength(2);
    expect(created.body.workflow.nodes[1].position).toEqual({ x: 250, y: 30 });

    const list = await request(app).get("/workflows").expect(200);
    expect(list.body.workflows.some((workflow: { id: string }) => workflow.id === workflowId)).toBe(true);
  });

  it("retrieves and updates a workflow graph transactionally", async () => {
    const fetched = await request(app).get(`/workflows/${workflowId}`).expect(200);
    expect(fetched.body.workflow.edges[0].sourceNodeId).toBe("trigger-node");

    const updated = await request(app).put(`/workflows/${workflowId}`).send({
      name: `${testName} updated`,
      nodes: [{ id: "http-node", type: "http", name: "HTTP Request", config: { label: "HTTP Request", type: "http", method: "GET" }, position: { x: 100, y: 180 } }],
      edges: [],
    }).expect(200);
    expect(updated.body.workflow.name).toBe(`${testName} updated`);
    expect(updated.body.workflow.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "http-node", type: "http" })]));
    expect(updated.body.workflow.version).toBe(2);
  });

  it("deletes a workflow and its graph data", async () => {
    await request(app).delete(`/workflows/${workflowId}`).expect(204);
    await request(app).get(`/workflows/${workflowId}`).expect(404);
  });
});

afterAll(async () => {
  if (workflowId) await prisma.workflow.deleteMany({ where: { id: workflowId } });
  await prisma.$disconnect();
});
