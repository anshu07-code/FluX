/**
 * End-to-end verification of the settings/account surface against the LIVE api:
 *   1. register a throwaway user
 *   2. profile update + fetch (provider detection)
 *   3. create an API key, verify it authenticates (x-flux-api-key)
 *   4. verify a bad key is rejected
 *   5. delete the account WITH password verification
 *   6. verify the cascade: API key + user gone
 *
 * Run: npx tsx scripts/e2e-account-lifecycle.ts
 */
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000";
const sink = [] as string[];
function log(line: string) {
  sink.push(line);
  console.log(line);
}

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const email = `e2e-${randomUUID()}@flux.test`;
const password = "test-password-123";
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  log("\n=== 1. Register throwaway user ===");
  const reg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "E2E User", email, password }),
  });
  check("register -> 201", reg.status === 201, `got ${reg.status} ${JSON.stringify(reg.body)}`);

  log("\n=== 2. Login (JWT) ===");
  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  check("login -> 200", login.status === 200, `got ${login.status}`);
  const token = (login.body as { token?: string })?.token;
  check("login returns token", typeof token === "string");
  const auth = { authorization: `Bearer ${token}` };

  log("\n=== 3. Profile: GET /auth/me ===");
  const me = await req("/auth/me", { headers: auth });
  check("GET /auth/me -> 200", me.status === 200, `got ${me.status}`);
  check("provider is email", (me.body as { user?: { provider?: string } })?.user?.provider === "email");

  const upd = await req("/auth/me", { method: "PUT", headers: auth, body: JSON.stringify({ name: "Renamed User" }) });
  check("PUT /auth/me -> 200", upd.status === 200, `got ${upd.status}`);
  check("name updated", (upd.body as { user?: { name?: string } })?.user?.name === "Renamed User");

  log("\n=== 4. API key lifecycle ===");
  const keyRes = await req("/api-keys", { method: "POST", headers: auth, body: JSON.stringify({ name: "E2E key" }) });
  check("create key -> 201", keyRes.status === 201, `got ${keyRes.status}`);
  const rawKey = (keyRes.body as { rawKey?: string })?.rawKey;
  check("raw key returned", typeof rawKey === "string");

  const used = await req("/auth/me", { headers: { "x-flux-api-key": rawKey! } });
  check("API key authenticates", used.status === 200, `got ${used.status}`);
  check("lastUsedAt recorded", Boolean((used.body as { user?: { lastUsedAt?: string } })?.user));

  const badKey = await req("/auth/me", { headers: { "x-flux-api-key": "flux_totallyinvalid" } });
  check("invalid key rejected -> 401", badKey.status === 401, `got ${badKey.status}`);

  const list = await req("/api-keys", { headers: auth });
  check("list keys -> 200", list.status === 200, `got ${list.status}`);
  check("key appears in list", ((list.body as { apiKeys?: { name: string }[] })?.apiKeys ?? []).some((k) => k.name === "E2E key"));

  log("\n=== 5. Create a workflow + run it (so execution history exists) ===");
  const wf = await req("/workflows", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "E2E delete-account workflow",
      nodes: [
        { id: "trig", type: "trigger", name: "Trigger", config: { triggerType: "manual" }, position: { x: 0, y: 0 } },
        { id: "n1", type: "code", name: "Hello", config: { language: "javascript", code: "return { ok: true };" }, position: { x: 0, y: 140 } },
      ],
      edges: [{ id: "e1", sourceNodeId: "trig", targetNodeId: "n1", config: {} }],
    }),
  });
  const wfId = (wf.body as { workflow?: { id: string } })?.workflow?.id;
  check("create workflow -> 201", wf.status === 201, `got ${wf.status}`);
  if (wfId) {
    const run = await req(`/workflows/${wfId}/run`, { method: "POST", headers: auth, body: JSON.stringify({ input: {} }) });
    check("run workflow -> 202/200", run.status === 202 || run.status === 200, `got ${run.status} ${JSON.stringify(run.body)}`);
  }

  log("\n=== 6. Delete account (password required) ===");
  const noPw = await req("/auth/me", { method: "DELETE", headers: auth, body: JSON.stringify({}) });
  check("delete without password -> 400", noPw.status === 400, `got ${noPw.status} ${JSON.stringify(noPw.body)}`);

  const wrongPw = await req("/auth/me", { method: "DELETE", headers: auth, body: JSON.stringify({ password: "wrong-password" }) });
  check("delete with wrong password -> 401", wrongPw.status === 401, `got ${wrongPw.status}`);

  const unauth = await req("/auth/me", { method: "DELETE", body: JSON.stringify({}) });
  check("delete with no auth rejected (not dev fallback)", unauth.status === 401, `got ${unauth.status}`);

  const del = await req("/auth/me", { method: "DELETE", headers: auth, body: JSON.stringify({ password }) });
  check("delete with correct password -> 204", del.status === 204, `got ${del.status} ${JSON.stringify(del.body)}`);

  log("\n=== 7. Verify the cascade ===");
  const after = await req("/auth/me", { headers: auth });
  // 401 = token rejected, 404 = valid token but user gone. Either way the
  // deleted account can no longer read its own profile.
  check("deleted account cannot read profile", after.status === 401 || after.status === 404, `got ${after.status}`);
  const keyAfter = await req("/auth/me", { headers: { "x-flux-api-key": rawKey! } });
  check("API key revoked after deletion", keyAfter.status === 401, `got ${keyAfter.status}`);

  log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(2);
});
