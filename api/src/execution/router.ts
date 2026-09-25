import { Router } from "express";
import { runWorkflowSchema } from "./schema.js";
import { getExecution, listWorkflowExecutions, startWorkflow } from "./service.js";
import { resolveAuthUser } from "../development-user.js";
import { prisma } from "../db.js";

export const executionRouter = Router();

executionRouter.get("/:executionId", async (request, response, next) => {
  try {
    const { userId } = await resolveAuthUser(request.headers as Record<string, string | undefined>, prisma);
    response.json({ execution: await getExecution(request.params.executionId, userId) });
  } catch (error) { next(error); }
});

export async function runWorkflowHandler(request: { params: { workflowId: string }; body: unknown; headers: Record<string, string | undefined> }, response: { status: (status: number) => { json: (body: unknown) => void } }, next: (error: unknown) => void) {
  try {
    const { userId } = await resolveAuthUser(request.headers, prisma);
    const options = runWorkflowSchema.parse(request.body ?? {});
    const result = await startWorkflow(request.params.workflowId, options, userId);
    return response.status(result.invalid ? 422 : result.started ? 202 : 200).json(result);
  } catch (error) { next(error); }
}

export async function listWorkflowExecutionsHandler(request: { params: { workflowId: string }; headers: Record<string, string | undefined> }, response: { json: (body: unknown) => void }, next: (error: unknown) => void) {
  try {
    const { userId } = await resolveAuthUser(request.headers, prisma);
    response.json({ executions: await listWorkflowExecutions(request.params.workflowId, userId) });
  } catch (error) { next(error); }
}
