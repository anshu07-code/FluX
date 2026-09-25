import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashApiKey } from "../development-user.js";

const MAX_KEYS_PER_USER = 10;
const KEY_RANDOM_BYTES = 24;

export class ApiKeyNotFoundError extends Error {
  constructor() {
    super("API key not found.");
  }
}

export class ApiKeyLimitExceededError extends Error {
  constructor(limit: number) {
    super(`You can have at most ${limit} API keys. Revoke one first.`);
  }
}

export type ApiKeyPublic = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function toPublic(key: { id: string; name: string; keyPrefix: string; createdAt: Date; lastUsedAt: Date | null }): ApiKeyPublic {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

export async function listApiKeys(client: PrismaClient, userId: string): Promise<ApiKeyPublic[]> {
  const keys = await client.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return keys.map(toPublic);
}

export async function createApiKey(client: PrismaClient, userId: string, name: string): Promise<{ apiKey: ApiKeyPublic; rawKey: string }> {
  const count = await client.apiKey.count({ where: { userId } });
  if (count >= MAX_KEYS_PER_USER) throw new ApiKeyLimitExceededError(MAX_KEYS_PER_USER);

  const rawKey = `flux_${randomBytes(KEY_RANDOM_BYTES).toString("base64url")}`;
  const cleanName = name.trim().slice(0, 64) || "API Key";

  const key = await client.apiKey.create({
    data: {
      userId,
      name: cleanName,
      keyHash: hashApiKey(rawKey),
      keyPrefix: `${rawKey.slice(0, 14)}••••••••`,
    },
  });
  await client.activityLog.create({
    data: { userId, action: "API_KEY_CREATE", resource: "api_key", resourceId: key.id, details: { name: key.name } },
  });

  return { apiKey: toPublic(key), rawKey };
}

export async function renameApiKey(client: PrismaClient, userId: string, keyId: string, name: string): Promise<ApiKeyPublic> {
  const cleanName = name.trim().slice(0, 64);
  if (!cleanName) throw new ApiKeyNotFoundError();

  const updated = await client.apiKey.updateMany({ where: { id: keyId, userId }, data: { name: cleanName } });
  if (updated.count === 0) throw new ApiKeyNotFoundError();

  await client.activityLog.create({
    data: { userId, action: "API_KEY_RENAME", resource: "api_key", resourceId: keyId, details: { name: cleanName } },
  });

  const key = await client.apiKey.findFirst({ where: { id: keyId, userId } });
  if (!key) throw new ApiKeyNotFoundError();
  return toPublic(key);
}

export async function revokeApiKey(client: PrismaClient, userId: string, keyId: string): Promise<void> {
  const deleted = await client.apiKey.deleteMany({ where: { id: keyId, userId } });
  if (deleted.count === 0) throw new ApiKeyNotFoundError();
  await client.activityLog.create({
    data: { userId, action: "API_KEY_REVOKE", resource: "api_key", resourceId: keyId },
  });
}
