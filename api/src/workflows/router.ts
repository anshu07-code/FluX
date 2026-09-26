import { Router } from "express";
import { ZodError } from "zod";
import { listWorkflowExecutionsHandler, runWorkflowHandler } from "../execution/router.js";
import { workflowInputSchema, validateGraph } from "./schema.js";
import { WorkflowNotFoundError, createWorkflow, deleteWorkflow, getWorkflow, listWorkflows, updateWorkflow, updateWorkflowStatus } from "./service.js";
import { validateDatabaseNodes } from "./validate-db-nodes.js";
import { resolveAuthUser } from "../development-user.js";
import { credentialKey, rateLimit } from "../rate-limit.js";
import { prisma } from "../db.js";

export const workflowRouter = Router();

function parseWorkflow(body: unknown) {
  const input = workflowInputSchema.parse(body);
  const graphError = validateGraph(input);
  if (graphError) throw new ZodError([{ code: "custom", path: [], message: graphError }]);
  return input;
}

workflowRouter.post("/", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    const input = parseWorkflow(request.body);
    const dbError = await validateDatabaseNodes(input.nodes);
    if (dbError) return response.status(400).json({ error: dbError });
    const workflow = await createWorkflow(input, userId);
    response.status(201).json({ workflow });
  } catch (error) { next(error); }
});

workflowRouter.get("/", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    response.json({ workflows: await listWorkflows(userId) });
  } catch (error) { next(error); }
});

workflowRouter.get("/:id", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    response.json({ workflow: await getWorkflow(request.params.id, userId) });
  } catch (error) { next(error); }
});

workflowRouter.put("/:id", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    const input = parseWorkflow(request.body);
    const dbError = await validateDatabaseNodes(input.nodes);
    if (dbError) return response.status(400).json({ error: dbError });
    response.json({ workflow: await updateWorkflow(request.params.id, input, userId) });
  } catch (error) { next(error); }
});

workflowRouter.delete("/:id", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    await deleteWorkflow(request.params.id, userId);
    response.status(204).send();
  } catch (error) { next(error); }
});

// A manual run starts a real execution (DB transactions + outbox + node side
// effects), so cap it per caller identity — not per IP — with credentialKey:
// API keys and logged-in users get their own budget, NAT'd users don't collide.
const runRateLimit = rateLimit({ name: "workflow-run", max: 60, keyOf: credentialKey });

workflowRouter.post("/:workflowId/run", runRateLimit, (req, res, next) => runWorkflowHandler(req as any, res as any, next));
workflowRouter.get("/:workflowId/executions", (req, res, next) => listWorkflowExecutionsHandler(req as any, res as any, next));

// Activate / deactivate a workflow (enables webhook + scheduler triggers)
workflowRouter.patch("/:id/status", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    const { status } = request.body as { status?: string };
    if (status !== "ACTIVE" && status !== "DRAFT" && status !== "ARCHIVED") {
      return response.status(400).json({ error: "Status must be ACTIVE, DRAFT, or ARCHIVED." });
    }
    // A workflow may only go live if its database nodes point at real tables
    // and columns — this is the last gate before webhooks/schedulers can fire it.
    if (status === "ACTIVE") {
      const current = await getWorkflow(request.params.id, userId);
      const dbError = await validateDatabaseNodes(current.nodes);
      if (dbError) return response.status(400).json({ error: dbError });
    }
    const workflow = await updateWorkflowStatus(request.params.id, status, userId);
    response.json({ workflow });
  } catch (error) { next(error); }
});

export function workflowErrorHandler(error: unknown, _request: unknown, response: { status: (code: number) => { json: (payload: unknown) => void } }, next: (err?: unknown) => void) {
  if (error instanceof ZodError) {
    return response.status(400).json({ error: "Validation failed.", details: error.flatten() });
  }
  if (error instanceof WorkflowNotFoundError) {
    return response.status(404).json({ error: error.message });
  }
  // Belt-and-braces for the rare id race that survives normalizeGraphIds'
  // retry: tell the client plainly instead of leaking a Prisma message.
  if (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    (error as { code?: unknown }).code === "P2002"
  ) {
    return response
      .status(409)
      .json({ error: "Some ids in this request are already in use — save again and they will be regenerated." });
  }
  // Pass unknown errors to Express's default handler (logs + 500)
  next(error);
}
