import { Router } from "express";
import { prisma } from "../db.js";
import { ApiKeyNotFoundError, ApiKeyLimitExceededError } from "./service.js";
import { ApiKeyError, AuthError, resolveAuthUser } from "../development-user.js";
import { createApiKey, listApiKeys, renameApiKey, revokeApiKey } from "./service.js";

const router = Router();

async function requireUser(request: { headers: Record<string, unknown> }) {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (typeof v === "string") headers[k] = v;
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") headers[k] = v[0];
  }
  return (await resolveAuthUser(headers, prisma)).userId;
}

router.get("/", async (request, response, next) => {
  try {
    const userId = await requireUser(request as { headers: Record<string, unknown> });
    response.json({ apiKeys: await listApiKeys(prisma, userId) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const userId = await requireUser(request as { headers: Record<string, unknown> });
    const name = typeof request.body?.name === "string" ? request.body.name : "API Key";
    const result = await createApiKey(prisma, userId, name);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (request, response, next) => {
  try {
    const userId = await requireUser(request as { headers: Record<string, unknown> });
    const name = typeof request.body?.name === "string" ? request.body.name : "";
    if (!name.trim()) {
      return response.status(400).json({ error: "Key name is required." });
    }
    const apiKey = await renameApiKey(prisma, userId, request.params.id, name);
    response.json({ apiKey });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (request, response, next) => {
  try {
    const userId = await requireUser(request as { headers: Record<string, unknown> });
    await revokeApiKey(prisma, userId, request.params.id);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as apiKeysRouter };

export function apiKeysErrorHandler(error: unknown, _request: unknown, response: { status: (code: number) => { json: (payload: unknown) => void } }, next: (err?: unknown) => void) {
  if (error instanceof ApiKeyError || error instanceof AuthError) {
    return response.status(401).json({ error: error.message });
  }
  if (error instanceof ApiKeyLimitExceededError) {
    return response.status(400).json({ error: error.message });
  }
  if (error instanceof ApiKeyNotFoundError) {
    return response.status(404).json({ error: error.message });
  }
  // Pass unknown errors to the next error handler
  next(error);
}
