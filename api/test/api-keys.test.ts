import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

/**
 * API keys are the non-interactive auth path: a `flux_…` secret presented via
 * the `x-flux-api-key` header or `Authorization: Bearer` must act as the key's
 * owner on every authenticated route — without any JWT or dev-user fallback
 * getting in the way. These tests register a throwaway user so identity is
 * provable (a dev-fallback resolution could never see that user's data).
 */
const email = `api-keys-test-${Date.now()}@flux.test`;
const password = "vitest-password-123";
let jwtToken = "";
let rawKey = "";
let keyId = "";
let workflowId = "";

describe("API keys as authentication", () => {
  it("registers a throwaway user and obtains a JWT", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "API Key Tester", email, password })
      .expect(201);
    expect(res.body.token).toBeTruthy();
    jwtToken = res.body.token;
  });

  it("creates a key and reveals the plaintext exactly once", async () => {
    const res = await request(app)
      .post("/api-keys")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "vitest key" })
      .expect(201);

    expect(res.body.rawKey).toMatch(/^flux_[A-Za-z0-9_-]{32}$/);
    expect(res.body.apiKey.keyPrefix.startsWith(res.body.rawKey.slice(0, 14))).toBe(true);
    rawKey = res.body.rawKey;
    keyId = res.body.apiKey.id;
  });

  it("lists keys with a masked prefix only — never the plaintext", async () => {
    const res = await request(app)
      .get("/api-keys")
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.apiKeys.some((k: { id: string }) => k.id === keyId)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(rawKey);
  });

  it("the key acts as its owner via x-flux-api-key (no JWT sent)", async () => {
    const created = await request(app)
      .post("/workflows")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({
        name: `api-key-owned workflow ${Date.now()}`,
        nodes: [{ id: "t1", type: "trigger", name: "Trigger", config: {}, position: { x: 0, y: 0 } }],
        edges: [],
      })
      .expect(201);
    workflowId = created.body.workflow.id;

    const res = await request(app)
      .get("/workflows")
      .set("x-flux-api-key", rawKey)
      .expect(200);
    const mine = res.body.workflows.find((w: { id: string }) => w.id === workflowId);
    expect(mine, "workflow created under the JWT owner must be visible to that owner's API key").toBeTruthy();
  });

  it("the key also works via Authorization: Bearer flux_…", async () => {
    const res = await request(app)
      .get(`/workflows/${workflowId}`)
      .set("Authorization", `Bearer ${rawKey}`)
      .expect(200);
    expect(res.body.workflow.id).toBe(workflowId);
  });

  it("touches lastUsedAt when the key authenticates", async () => {
    await request(app).get("/workflows").set("x-flux-api-key", rawKey).expect(200);
    // lastUsedAt is written fire-and-forget, so poll briefly.
    let seen = false;
    for (let attempt = 0; attempt < 20 && !seen; attempt++) {
      const res = await request(app)
        .get("/api-keys")
        .set("Authorization", `Bearer ${jwtToken}`)
        .expect(200);
      const entry = res.body.apiKeys.find((k: { id: string }) => k.id === keyId);
      seen = Boolean(entry?.lastUsedAt);
      if (!seen) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(seen).toBe(true);
  });

  it("rejects an unknown key with 401 instead of falling back to the dev user", async () => {
    await request(app).get("/workflows").set("x-flux-api-key", "flux_definitelynotarealkey").expect(401);
  });

  it("rejects a malformed bearer token with 401", async () => {
    await request(app).get("/workflows").set("Authorization", "Bearer not.a.jwt").expect(401);
  });

  it("revoking the key immediately invalidates it", async () => {
    await request(app)
      .delete(`/api-keys/${keyId}`)
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(204);
    await request(app).get("/workflows").set("x-flux-api-key", rawKey).expect(401);
  });
});

afterAll(async () => {
  if (workflowId) await prisma.workflow.deleteMany({ where: { id: workflowId } });
  if (keyId) {
    await prisma.apiKey.deleteMany({ where: { id: keyId } });
    await prisma.activityLog.deleteMany({ where: { resourceId: keyId } });
  }
  if (email) await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});
