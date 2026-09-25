import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { NODE_EXECUTION_REQUESTED_EVENT, EXECUTION_TOPIC, type NodeExecutionEventPayload } from "../src/execution/events.js";
import { publishPendingOutboxEvents, type KafkaProducerLike } from "../src/execution/outbox-publisher.js";
import { handleNodeExecutionEvent } from "../src/execution/distributed-handler.js";

const createdWorkflowIds: string[] = [];

function makeNode(type: string, config: Record<string, unknown> = {}) {
  const id = randomUUID();
  return { id, type, name: type, config: { label: type, type, ...config }, position: { x: 0, y: 0 } };
}

function makeEdge(sourceNodeId: string, targetNodeId: string, config: Record<string, unknown> = {}) {
  const id = randomUUID();
  return { id, sourceNodeId, targetNodeId, config };
}

async function createGraph(name: string, nodes: object[], edges: object[]) {
  const response = await request(app).post("/workflows").send({ name: `${name}-${randomUUID()}`, nodes, edges }).expect(201);
  createdWorkflowIds.push(response.body.workflow.id);
  return response.body.workflow.id as string;
}

describe("Phase 3B - Distributed Execution with Transactional Outbox", () => {
  beforeEach(() => {
    process.env.EXECUTION_MODE = "distributed";
  });

  afterAll(async () => {
    process.env.EXECUTION_MODE = "local";
    for (const workflowId of createdWorkflowIds) {
      await request(app).delete(`/workflows/${workflowId}`);
    }
  });

  it("1. API run creates WorkflowExecution + NodeExecution + OutboxEvent atomically", async () => {
    const trigger = makeNode("trigger");
    const http = makeNode("http", { url: "https://example.com", mockResponse: { ok: true } });
    const edge1 = makeEdge(trigger.id, http.id);

    const workflowId = await createGraph("outbox-atomicity", [trigger, http], [edge1]);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { test: "data" } })
      .expect(202);

    const executionId = runRes.body.execution.id;
    expect(executionId).toBeDefined();
    expect(runRes.body.execution.status).toBe("PENDING");

    // Verify OutboxEvent was created atomically in the DB
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { aggregateId: executionId },
    });

    expect(outboxEvents.length).toBe(1);
    const event = outboxEvents[0];
    expect(event.eventType).toBe(NODE_EXECUTION_REQUESTED_EVENT);
    expect(event.processedAt).toBeNull();

    const payload = event.payload as unknown as NodeExecutionEventPayload;
    expect(payload.workflowExecutionId).toBe(executionId);
    expect(payload.nodeId).toBe(trigger.id);
    expect(payload.input).toEqual({ test: "data" });
  });

  it("2. Processor publishes an outbox event successfully to Kafka and marks it processed", async () => {
    const publishedMessages: Array<{ topic: string; messages: Array<{ key?: string; value: string }> }> = [];
    const mockProducer: KafkaProducerLike = {
      send: async (record) => {
        publishedMessages.push(record);
        return [{ topicName: record.topic, partition: 0, errorCode: 0, offset: "1" }];
      },
    };

    // Grab the oldest unprocessed outbox event in the database
    const oldestPending = await prisma.outboxEvent.findFirst({
      where: { processedAt: null },
      orderBy: { createdAt: "asc" },
    });
    expect(oldestPending).not.toBeNull();

    const result = await publishPendingOutboxEvents(prisma, mockProducer, 1);
    expect(result.publishedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    expect(publishedMessages.length).toBe(1);
    expect(publishedMessages[0].topic).toBe(EXECUTION_TOPIC);

    // Verify database record has processedAt timestamp
    const updated = await prisma.outboxEvent.findUnique({
      where: { id: oldestPending!.id },
    });
    expect(updated?.processedAt).not.toBeNull();
  });

  it("3. Processor does not mark an event as published if Kafka publishing fails", async () => {
    // Create an unfulfilled outbox event
    const testOutbox = await prisma.outboxEvent.create({
      data: {
        eventType: NODE_EXECUTION_REQUESTED_EVENT,
        aggregateId: "failed-kafka-test-agg",
        payload: { test: "failure" },
      },
    });

    const failingProducer: KafkaProducerLike = {
      send: async () => {
        throw new Error("Kafka broker connection timeout");
      },
    };

    const result = await publishPendingOutboxEvents(prisma, failingProducer, 1);
    expect(result.failedCount).toBe(1);

    // Check that processedAt is STILL null
    const notProcessed = await prisma.outboxEvent.findUnique({
      where: { id: testOutbox.id },
    });
    expect(notProcessed?.processedAt).toBeNull();

    // Clean up
    await prisma.outboxEvent.delete({ where: { id: testOutbox.id } });
  });

  it("4. Worker consumes an event and executes a node using the reusable execution core", async () => {
    const trigger = makeNode("trigger");
    const ai = makeNode("ai");
    const edge1 = makeEdge(trigger.id, ai.id);

    const workflowId = await createGraph("worker-step", [trigger, ai], [edge1]);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { query: "hello ai" } })
      .expect(202);

    const executionId = runRes.body.execution.id;
    const outboxEvent = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: executionId },
    });

    const payload = outboxEvent.payload as unknown as NodeExecutionEventPayload;

    // Simulate worker processing this event
    const handleResult = await handleNodeExecutionEvent(prisma, payload);
    expect(handleResult.status).toBe("PROCESSED");
    expect(handleResult.nextEventsCreated).toBe(1);

    // Trigger node execution should now be SUCCESS
    const triggerExecution = await prisma.nodeExecution.findUnique({
      where: { id: payload.nodeExecutionId },
    });
    expect(triggerExecution?.status).toBe("SUCCESS");
  });

  it("5. Duplicate Kafka event does not execute an already-successful NodeExecution twice", async () => {
    const trigger = makeNode("trigger");
    const workflowId = await createGraph("worker-idempotency", [trigger], []);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { val: 1 } })
      .expect(202);

    const executionId = runRes.body.execution.id;
    const outboxEvent = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: executionId },
    });
    const payload = outboxEvent.payload as unknown as NodeExecutionEventPayload;

    // First delivery: processes successfully
    const firstRun = await handleNodeExecutionEvent(prisma, payload);
    expect(firstRun.status).toBe("PROCESSED");

    // Second delivery: duplicate event
    const secondRun = await handleNodeExecutionEvent(prisma, payload);
    expect(secondRun.status).toBe("SKIPPED_ALREADY_SUCCESS");
  });

  it("6. Worker creates the next NodeExecution + OutboxEvent transactionally", async () => {
    const trigger = makeNode("trigger");
    const email = makeNode("email", { recipient: "boss@company.com" });
    const edge1 = makeEdge(trigger.id, email.id);

    const workflowId = await createGraph("worker-next-step", [trigger, email], [edge1]);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { message: "Report ready" } })
      .expect(202);

    const executionId = runRes.body.execution.id;
    const triggerOutbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: executionId },
    });

    // Worker processes trigger
    await handleNodeExecutionEvent(prisma, triggerOutbox.payload as unknown as NodeExecutionEventPayload);

    // Check that email NodeExecution and next OutboxEvent exist
    const emailNodeExec = await prisma.nodeExecution.findFirst({
      where: { executionId, nodeId: email.id },
    });
    expect(emailNodeExec).not.toBeNull();
    expect(emailNodeExec?.status).toBe("PENDING");

    const emailOutbox = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: executionId,
        id: { not: triggerOutbox.id },
      },
    });
    expect(emailOutbox).not.toBeNull();
    const emailPayload = emailOutbox?.payload as unknown as NodeExecutionEventPayload;
    expect(emailPayload.nodeId).toBe(email.id);
  });

  it("7. End-to-end distributed flow: Trigger -> HTTP -> AI -> Email completes workflow", async () => {
    const trigger = makeNode("trigger");
    const http = makeNode("http", { url: "https://example.com", mockResponse: { score: 99 } });
    const ai = makeNode("ai");
    const email = makeNode("email", { recipient: "done@test.com" });

    const workflowId = await createGraph("e2e-distributed", [trigger, http, ai, email], [
      makeEdge(trigger.id, http.id),
      makeEdge(http.id, ai.id),
      makeEdge(ai.id, email.id),
    ]);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { initial: "start" } })
      .expect(202);

    const executionId = runRes.body.execution.id;

    // Drive the workflow forward through event queue simulation until completion
    let maxSteps = 10;
    while (maxSteps-- > 0) {
      const pendingOutbox = await prisma.outboxEvent.findFirst({
        where: { aggregateId: executionId, processedAt: null },
        orderBy: { createdAt: "asc" },
      });

      if (!pendingOutbox) break;

      const payload = pendingOutbox.payload as unknown as NodeExecutionEventPayload;
      await handleNodeExecutionEvent(prisma, payload);

      await prisma.outboxEvent.update({
        where: { id: pendingOutbox.id },
        data: { processedAt: new Date() },
      });
    }

    const finalExec = await request(app).get(`/executions/${executionId}`).expect(200);
    expect(finalExec.body.execution.status).toBe("SUCCESS");
    expect(finalExec.body.execution.nodeExecutions).toHaveLength(4);
    expect(finalExec.body.execution.nodeExecutions.every((n: { status: string }) => n.status === "SUCCESS")).toBe(true);
  });

  it("8. Condition branching still works through the distributed architecture", async () => {
    const trigger = makeNode("trigger");
    const condition = makeNode("condition", { inputPath: "value", operator: ">", value: 10 });
    const emailTrue = makeNode("email", { recipient: "true@test.com" });
    const emailFalse = makeNode("email", { recipient: "false@test.com" });

    const workflowId = await createGraph("distributed-condition", [trigger, condition, emailTrue, emailFalse], [
      makeEdge(trigger.id, condition.id),
      makeEdge(condition.id, emailTrue.id, { branch: "true" }),
      makeEdge(condition.id, emailFalse.id, { branch: "false" }),
    ]);

    const runRes = await request(app)
      .post(`/workflows/${workflowId}/run`)
      .send({ input: { value: 20 } })
      .expect(202);

    const executionId = runRes.body.execution.id;

    // Process all events
    let maxSteps = 10;
    while (maxSteps-- > 0) {
      const pendingOutbox = await prisma.outboxEvent.findFirst({
        where: { aggregateId: executionId, processedAt: null },
        orderBy: { createdAt: "asc" },
      });

      if (!pendingOutbox) break;

      const payload = pendingOutbox.payload as unknown as NodeExecutionEventPayload;
      await handleNodeExecutionEvent(prisma, payload);

      await prisma.outboxEvent.update({
        where: { id: pendingOutbox.id },
        data: { processedAt: new Date() },
      });
    }

    const finalExec = await request(app).get(`/executions/${executionId}`).expect(200);
    expect(finalExec.body.execution.status).toBe("SUCCESS");

    const executedNodeIds = finalExec.body.execution.nodeExecutions.map((n: { node: { id: string } }) => n.node.id);
    expect(executedNodeIds).toContain(emailTrue.id);
    expect(executedNodeIds).not.toContain(emailFalse.id);
  });
});
