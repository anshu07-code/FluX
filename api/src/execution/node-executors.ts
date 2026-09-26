import { createHash, timingSafeEqual } from "node:crypto";
import vm from "node:vm";
import type { Prisma, WorkflowNode } from "@prisma/client";
import { isIP } from "node:net";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { getSmtpTransporter } from "../mail.js";
import { getJwtSecret } from "../development-user.js";
import {
  INTERNAL_TABLES,
  createTableIfMissing,
  ensureDataColumns,
  extractPgCode,
  fetchTableColumns,
  friendlyDbError,
  isValidTableName,
  listBusinessTables,
  planDataColumns,
  serializeParam,
} from "./db-support.js";

type Config = Record<string, unknown>;

/**
 * Per-execution facts threaded from the runners into node executors.
 * `ownerId` scopes database access: auto-created tables get an owner_id
 * column that is stamped and filtered by the workflow's owner, so two users
 * on a shared FluX instance never see each other's rows.
 */
export interface ExecutionContext {
  ownerId?: string | null;
}

/** Safe cast for return objects whose shapes are correct but TS can't prove it. */
function asJson(value: Record<string, unknown>): Prisma.JsonValue {
  return value as unknown as Prisma.JsonValue;
}

export class NodeExecutionError extends Error {}

/**
 * An external service is unconfigured (or the provider call failed). In
 * production this MUST fail the node loudly — a workflow must never report
 * SUCCESS while silently skipping the real side effect, because then nobody
 * can tell real execution from a no-op. In development we fall through to the
 * caller's documented mock so templates run out of the box.
 *
 * This mirrors the email node's existing production behavior and makes it the
 * rule for every service node.
 */
function failLoudInProduction(note: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new NodeExecutionError(note);
  }
}

/**
 * Marker key for durable waits. A delay/wait node whose pause exceeds the
 * in-process limit returns this (ISO timestamp) at the top level of its output;
 * the execution core marks the node WAITING and the scheduler resumes the
 * workflow at that time — surviving process restarts.
 */
export const FLUX_WAIT_KEY = "__fluxWaitUntil";

/** Reads the durable-wait marker from a node's output, if present and valid. */
export function waitUntilOf(output: Prisma.JsonValue | undefined): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const value = (output as Record<string, unknown>)[FLUX_WAIT_KEY];
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Returns a copy of the output without the wait marker (for downstream input). */
export function stripWaitMarker(output: Prisma.JsonValue | undefined): Prisma.JsonValue {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output ?? {};
  if (!(FLUX_WAIT_KEY in (output as Record<string, unknown>))) return output;
  const { [FLUX_WAIT_KEY]: _omitted, ...rest } = output as Record<string, unknown>;
  return rest as Prisma.JsonValue;
}

function configFor(node: WorkflowNode): Config {
  return node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config as Config : {};
}

function valueAt(input: Prisma.JsonValue | undefined, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((current, part) => (current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[part] : undefined), input);
}

/** Resolves {{path.to.value}} expressions against the node input. */
export function resolveTemplateString(value: unknown, input: Prisma.JsonValue | undefined): unknown {
  if (typeof value !== "string") return value;
  if (!value.includes("{{")) return value;
  return value.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_all, path: string) => {
    const resolved = valueAt(input, path);
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

export function resolveTemplateDeep(value: unknown, input: Prisma.JsonValue | undefined): unknown {
  if (typeof value === "string") return resolveTemplateString(value, input);
  if (Array.isArray(value)) return value.map((item) => resolveTemplateDeep(item, input));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplateDeep(v, input)]));
  }
  return value;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function assertSafeHttpUrl(value: unknown): URL {
  if (typeof value !== "string") throw new NodeExecutionError("HTTP node requires a URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NodeExecutionError("HTTP node URL is invalid.");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new NodeExecutionError("HTTP node URL is not allowed.");
  // Anti-SSRF: block localhost/private ranges by default. Self-hosted deployments
  // that legitimately call internal services can opt in via env.
  const allowPrivateTargets = process.env.ALLOW_PRIVATE_HTTP_TARGETS === "true";
  if (allowPrivateTargets) return url;
  const host = url.hostname.toLowerCase();
  const ipVersion = isIP(host);
  const privateIpv4 = /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || (ipVersion !== 0 && privateIpv4)) {
    throw new NodeExecutionError(
      "HTTP node URL targets a local network address. Set ALLOW_PRIVATE_HTTP_TARGETS=true to allow internal targets."
    );
  }
  return url;
}

const HTTP_TIMEOUT_CAP_MS = 20_000;

async function executeHttp(node: WorkflowNode, input: Prisma.JsonValue | undefined): Promise<Prisma.JsonValue> {
  const config = configFor(node);
  // Note: `mockResponse` is a legacy demo field; it is intentionally ignored so
  // real HTTP calls always happen. Delete any stale copies from node configs.
  const rawUrl = resolveTemplateString(config.url, input);
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    // Unconfigured service. In production this fails the node loudly; in
    // development it returns a documented mock so templates run out of the box.
    // When a URL IS configured a real request is always made (mockResponse is ignored).
    failLoudInProduction("HTTP node has no URL configured. Set a URL in the node config to make a real request.");
    const mockMethod = (typeof config.method === "string" ? config.method.toUpperCase() : "GET");
    console.warn("[http] No URL configured — returning mock response. Set a URL in the node config for real requests.");
    return asJson({
      status: 0,
      ok: false,
      mock: true,
      method: mockMethod,
      url: null,
      body: null,
      note: "HTTP node has no URL configured. Set a URL in the node config to make a real request.",
    });
  }
  assertSafeHttpUrl(rawUrl);

  const method = (typeof config.method === "string" ? config.method.toUpperCase() : "GET");
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new NodeExecutionError(`HTTP method ${method} is not supported.`);
  const timeout =
    typeof config.timeoutMs === "number" ? config.timeoutMs : typeof config.timeout === "number" ? config.timeout : 5_000;
  const clampedTimeout = Math.max(100, Math.min(timeout, HTTP_TIMEOUT_CAP_MS));

  let headers: Record<string, string> = {};
  if (config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)) {
    headers = Object.fromEntries(
      Object.entries(resolveTemplateDeep(config.headers, input) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])
    );
  }

  // Auth injection from the node config (authType + token/credentials fields).
  const authType = typeof config.authType === "string" ? config.authType.toLowerCase() : "none";
  const authToken = resolveTemplateString(config.authToken ?? config.token ?? config.apiKey ?? "", input);
  const authUser = resolveTemplateString(config.username ?? config.authUser ?? "", input);
  const authPass = resolveTemplateString(config.password ?? config.authPassword ?? "", input);
  const apiKeyHeader = typeof config.apiKeyHeader === "string" && config.apiKeyHeader ? config.apiKeyHeader : "X-API-Key";
  if (authType === "bearer" && typeof authToken === "string" && authToken) {
    headers["authorization"] = headers["authorization"] ?? `Bearer ${authToken}`;
  } else if (authType === "basic" && typeof authUser === "string" && authUser) {
    headers["authorization"] = headers["authorization"] ?? `Basic ${Buffer.from(`${authUser}:${String(authPass ?? "")}`).toString("base64")}`;
  } else if (authType === "apikey" && typeof authToken === "string" && authToken) {
    headers[apiKeyHeader.toLowerCase()] = headers[apiKeyHeader.toLowerCase()] ?? authToken;
    // Common convention: also set Authorization if no header was chosen explicitly.
    if (!config.apiKeyHeader && !headers["authorization"]) headers["authorization"] = `Bearer ${authToken}`;
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE") {
    const rawBody = config.body;
    const resolvedBody =
      typeof rawBody === "string" ? (JSON.parse(resolveTemplateString(rawBody, input) as string) ?? {}) : resolveTemplateDeep(rawBody ?? {}, input);
    body = JSON.stringify(resolvedBody);
  }

  const followRedirects = config.followRedirects !== false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clampedTimeout);
  try {
    const response = await fetch(rawUrl, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body,
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
    });
    const text = (await response.text()).slice(0, 10_000);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return asJson({ status: response.status, ok: response.ok, body: parsed as string | object, url: rawUrl });
  } catch (error) {
    if (error instanceof NodeExecutionError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new NodeExecutionError("HTTP request timed out.");
    throw new NodeExecutionError("HTTP request failed.");
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOperator(value: unknown): string {
  switch (String(value ?? "").toLowerCase()) {
    case "gt":
    case ">":
      return ">";
    case "ge":
    case ">=":
      return ">=";
    case "lt":
    case "<":
      return "<";
    case "le":
    case "<=":
      return "<=";
    case "eq":
    case "=":
    case "==":
      return "=";
    case "neq":
    case "!=":
      return "!=";
    case "contains":
      return "contains";
    case "starts_with":
      return "starts_with";
    case "regex":
      return "regex";
    case "empty":
      return "empty";
    default:
      return String(value ?? ">");
  }
}

function executeCondition(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const rawLeft = config.inputPath ?? config.leftValue ?? "value";
  const thresholdRaw = config.value ?? config.rightValue;
  const operator = normalizeOperator(config.operator);
  // Left side: a bare dot-path (e.g. "output.status") is looked up in the
  // input; a {{template}} (the UI's placeholder style) is evaluated and used
  // as the value itself — resolving it and then treating the result as a path
  // would look up e.g. the literal "true" as a key and always miss.
  let actual: unknown;
  if (typeof rawLeft === "string" && rawLeft.includes("{{")) {
    const resolved = resolveTemplateString(rawLeft, input);
    actual = typeof resolved === "string" && resolved.includes("{{") ? undefined : resolved;
  } else {
    actual = valueAt(input, typeof rawLeft === "string" && rawLeft.length > 0 ? rawLeft : "value");
  }

  let result: boolean;
  if (operator === "empty") {
    result = actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0);
  } else if (operator === "contains") {
    result = String(actual ?? "").toLowerCase().includes(String(thresholdRaw ?? "").toLowerCase());
  } else if (operator === "starts_with") {
    result = String(actual ?? "").toLowerCase().startsWith(String(thresholdRaw ?? "").toLowerCase());
  } else if (operator === "regex") {
    try {
      result = new RegExp(String(thresholdRaw ?? "")).test(String(actual ?? ""));
    } catch {
      result = false;
    }
  } else {
    const a = coerceNumber(actual);
    const t = coerceNumber(thresholdRaw);
    if (a !== undefined && t !== undefined) {
      result =
        operator === ">" ? a > t : operator === ">=" ? a >= t : operator === "<" ? a < t : operator === "<=" ? a <= t : operator === "=" ? a === t : a !== t;
    } else {
      result =
        operator === "=" ? String(actual ?? "") === String(thresholdRaw ?? "") : String(actual ?? "") !== String(thresholdRaw ?? "");
    }
  }

  return asJson({
    ...(input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}),
    result,
    actual: actual as string | number | boolean | null,
    operator,
    value: thresholdRaw as string | number | undefined,
  });
}

function executeSwitch(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const rawValue = resolveTemplateString(config.value ?? config.inputPath ?? "value", input);
  const value = typeof rawValue === "string" ? valueAt(input, rawValue) ?? rawValue : rawValue;
  // The UI rules editor saves `{ active: "case1", inactive: "case2" }` (value -> branch),
  // while the documented shape is `[{ value, output }]`. Normalize both.
  type Rule = { value?: unknown; output?: unknown };
  let rules: Rule[] = [];
  if (Array.isArray(config.rules)) {
    rules = config.rules as Rule[];
  } else if (config.rules && typeof config.rules === "object") {
    rules = Object.entries(config.rules as Record<string, unknown>).map(([k, v]) => ({ value: k, output: v }));
  }
  const asString = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const matched = rules.find((rule) => asString(rule.value) === asString(value));
  let branch: string;
  if (matched) {
    const out = matched.output;
    const asNum = typeof out === "number" ? out : typeof out === "string" && /^\d+$/.test(out) ? Number(out) : undefined;
    // Accept: numeric index (0 -> case1), "case1"/"default" strings, and named branches.
    if (asNum !== undefined) branch = `case${asNum + 1}`;
    else if (typeof out === "string" && out.length > 0) branch = /^(case\d+|default)$/i.test(out) ? out.toLowerCase() : out;
    else branch = "default";
  } else {
    branch = "default";
  }
  return asJson({
    ...(input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}),
    value: value as string | number | null,
    branch,
    matched: matched ?? null,
  });
}

function executeCode(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const language = typeof config.language === "string" ? config.language.toLowerCase() : "javascript";
  if (language !== "javascript" && language !== "js") throw new NodeExecutionError("Code node only supports JavaScript.");
  const code = typeof config.code === "string" ? config.code : "return input;";
  const captured: string[] = [];
  const sandboxConsole = {
    log: (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
    error: (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
    warn: (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
    info: (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    },
  };
  const context = vm.createContext({
    input,
    $input: input,
    console: sandboxConsole,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
  });
  let result: unknown;
  try {
    const script = new vm.Script(`(function () { ${code} })()`);
    result = script.runInContext(context, { timeout: 3_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown code error.";
    throw new NodeExecutionError(`Code node failed: ${message}`);
  }
  if (result === undefined) return asJson({ ...((input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>), processed: true });
  return asJson({ result, ...(input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}) });
}

/**
 * Runs one Loop-node item expression in the same sandboxed context as the Code
 * node. The expression sees `item`, `index` and `input` and may be `async`.
 */
async function runItemExpression(code: string, item: unknown, index: number, input: Prisma.JsonValue | undefined): Promise<unknown> {
  const context = vm.createContext({
    item,
    index,
    input,
    JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  });
  const script = new vm.Script(`(async function () { ${code} })()`);
  const pending = script.runInContext(context, { timeout: 3_000 });
  if (pending && typeof pending === "object" && typeof (pending as Promise<unknown>).then === "function") {
    return await (pending as Promise<unknown>);
  }
  return pending;
}

async function executeWebhook(node: WorkflowNode, input: Prisma.JsonValue | undefined): Promise<Prisma.JsonValue> {
  const config = configFor(node);
  const rawUrl = resolveTemplateString(config.url, input);
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "POST";
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    // Unconfigured service. Fails loudly in production; documented mock in dev.
    failLoudInProduction("Webhook node has no URL configured. Set a URL in the node config to make a real request.");
    console.warn("[webhook] No URL configured — returning mock response. Set a URL in the node config.");
    return asJson({
      status: 0,
      ok: false,
      mock: true,
      method,
      url: null,
      body: null,
      note: "Webhook node has no URL configured. Set a URL in the node config to make a real request.",
    });
  }
  assertSafeHttpUrl(rawUrl);
  if (method !== "POST" && method !== "GET") throw new NodeExecutionError("Webhook node only supports GET and POST.");
  const payload = resolveTemplateDeep(config.payload ?? config.body ?? {}, input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(rawUrl, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const text = (await response.text()).slice(0, 5_000);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return asJson({ status: response.status, ok: response.ok, body: parsed as string | object });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new NodeExecutionError("Webhook request timed out.");
    throw new NodeExecutionError("Webhook request failed.");
  } finally {
    clearTimeout(timer);
  }
}

function executeSet(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const rawAssignments = config.assignments ?? config.values ?? {};
  const assignments = resolveTemplateDeep(rawAssignments, input);
  const base = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  if (config.keepOnlySet === true) return asJson({ ...(assignments as Record<string, unknown>) });
  return asJson({ ...base, ...(assignments as Record<string, unknown>) });
}

function executeFilter(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const rawPath = resolveTemplateString(config.inputPath ?? "items", input);
  const path = typeof rawPath === "string" && rawPath.length > 0 ? rawPath : "items";
  const arr = valueAt(input, path);
  if (!Array.isArray(arr)) return asJson({ items: [], rest: [], matchedCount: 0, totalCount: 0, branch: "matching" });

  const condition = typeof config.condition === "string" ? config.condition : "";
  const match = condition.match(/^\s*(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+?)\s*$/);
  const evaluate = (item: unknown): boolean => {
    if (!match) return true;
    const [, lhs, op, rhsRaw] = match;
    const itemObj = item && typeof item === "object" && !Array.isArray(item) ? item : undefined;
    let lhsValue: unknown;
    const expr = lhs.trim();
    if (expr.startsWith("{{") && expr.endsWith("}}")) {
      lhsValue = itemObj ? valueAt(itemObj, expr.slice(2, -2).trim()) : undefined;
    } else {
      // Accept a bare field name ("status"), "item.field" / "$item.field",
      // and bracket access ("item['status']") for natural expression syntax.
      const bare = expr
        .replace(/^(?:\$?item\.|\$?item\['|")/, "")
        .replace(/['"]$/, "");
      lhsValue = itemObj ? (itemObj as Record<string, unknown>)[bare] : item;
    }
    let rhsValue: string | number = rhsRaw.trim();
    if ((typeof rhsValue === "string" && rhsValue.startsWith("'") && rhsValue.endsWith("'")) || (typeof rhsValue === "string" && rhsValue.startsWith('"') && rhsValue.endsWith('"'))) {
      rhsValue = rhsValue.slice(1, -1);
    }
    const numLhs = coerceNumber(lhsValue);
    const numRhs = coerceNumber(rhsValue);
    // Numeric comparison for ordering operators.
    if (op === ">" || op === "<" || op === ">=" || op === "<=") {
      if (numLhs === undefined || numRhs === undefined) return false;
      return op === ">" ? numLhs > numRhs : op === "<" ? numLhs < numRhs : op === ">=" ? numLhs >= numRhs : numLhs <= numRhs;
    }
    let cmpRhs: unknown = rhsValue;
    if (numRhs !== undefined) cmpRhs = numRhs;
    if (op === "===" || op === "==") return lhsValue === cmpRhs;
    return lhsValue !== cmpRhs;
  };

  const matched: unknown[] = [];
  const rest: unknown[] = [];
  for (const item of arr) {
    if (evaluate(item)) matched.push(item);
    else rest.push(item);
  }
  if (config.keepMatching === false) return asJson({ items: rest as Prisma.JsonValue[], rest: matched as Prisma.JsonValue[], matchedCount: matched.length, totalCount: arr.length, branch: "matching" });
  return asJson({ items: matched as Prisma.JsonValue[], rest: rest as Prisma.JsonValue[], matchedCount: matched.length, totalCount: arr.length, branch: "matching" });
}

function executeAuth(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const authType = typeof config.authType === "string" ? config.authType : "apikey";
  const secret = typeof config.secret === "string" ? config.secret : "";
  const rawSource = resolveTemplateString(config.tokenSource ?? "token", input);
  const source = typeof rawSource === "string" && rawSource.length > 0 ? rawSource : "token";
  const token = valueAt(input, source) ?? valueAt(input, "headers.authorization") ?? valueAt(input, "headers.x-api-key");

  if (!secret || secret.length === 0) {
    // No secret configured — nothing to validate against. Fail closed so a missing
    // config can't silently grant access.
    return asJson({ authenticated: false, reason: "No secret configured for Auth Gate. Set the secret in the node config.", branch: "denied" });
  }

  const tokenString = typeof token === "string" ? token.replace(/^Bearer\s+/i, "") : "";
  if (authType === "apikey") {
    const expected = createHash("sha256").update(secret).digest();
    const provided = createHash("sha256").update(tokenString).digest();
    const ok = expected.length === provided.length && timingSafeEqual(expected, provided);
    return asJson({ authenticated: ok, reason: ok ? "API key accepted." : "API key rejected.", branch: ok ? "main" : "denied" });
  }
  if (authType === "jwt") {
    const jwtSecret = typeof config.secret === "string" && config.secret.length > 0 ? config.secret : getJwtSecret();
    try {
      jwt.verify(tokenString, jwtSecret);
      return asJson({ authenticated: true, reason: "JWT signature verified.", branch: "main" });
    } catch (err) {
      const msg = err instanceof jwt.TokenExpiredError ? "JWT expired." : err instanceof jwt.JsonWebTokenError ? "Invalid JWT signature." : "JWT verification failed.";
      return asJson({ authenticated: false, reason: msg, branch: "denied" });
    }
  }
  // OAuth token introspection requires an introspection endpoint; without one we cannot
  // validate, so fail closed rather than pretend the request is authenticated.
  return asJson({ authenticated: false, reason: "OAuth validation is not supported. Use API Key or JWT auth, or provide an introspection endpoint.", branch: "denied" });
}

function executeError(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const action = typeof config.action === "string" ? config.action : "continue";
  const base = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return asJson({ ...base, errorHandled: true, onErrorAction: action });
}

async function executeDocument(node: WorkflowNode, input: Prisma.JsonValue | undefined): Promise<Prisma.JsonValue> {
  const config = configFor(node);
  const source = typeof config.source === "string" ? config.source : "url";
  const parseMode = typeof config.parseMode === "string" ? config.parseMode : "text";
  const outputFormat = typeof config.outputFormat === "string" ? config.outputFormat : "text";
  const rawUrl = resolveTemplateString(config.documentUrl ?? config.url ?? "", input);
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    // Unconfigured service. Fails loudly in production; documented mock in dev.
    failLoudInProduction("Document node has no document URL configured. Set a URL in the node config to parse a real document.");
    console.warn("[document] No document URL configured — returning mock parse. Set a URL in the node config.");
    return asJson({
      status: "SUCCESS" as const,
      output: {
        parsed: false,
        mock: true,
        text: "",
        format: outputFormat,
        note: "Document node has no document URL configured. Set a URL in the node config to parse a real document.",
      },
    });
  }
  if (parseMode === "ocr") {
    throw new NodeExecutionError("OCR parsing is not implemented. Use parse mode 'text' or provide pre-extracted text.");
  }

  // Fetch the document (only http/https sources are supported).
  let content: string;
  if (/^https?:\/\//i.test(rawUrl)) {
    assertSafeHttpUrl(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(rawUrl, { signal: controller.signal });
      if (!res.ok) throw new NodeExecutionError(`Document fetch failed with status ${res.status}.`);
      content = (await res.text()).slice(0, 200_000);
    } catch (error) {
      if (error instanceof NodeExecutionError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new NodeExecutionError("Document fetch timed out.");
      throw new NodeExecutionError("Document fetch failed.");
    } finally {
      clearTimeout(timer);
    }
  } else if (source === "base64" || rawUrl.length > 100) {
    // Treat the value itself as inline (base64 or raw) content.
    try {
      content = Buffer.from(rawUrl, "base64").toString("utf-8");
      // Heuristic: if base64 decoding produced mostly binary garbage, fall back to raw text.
      if (content.includes("\u0000")) content = rawUrl;
    } catch {
      content = rawUrl;
    }
  } else {
    throw new NodeExecutionError("Unsupported document source. Provide an http(s) URL or base64 content.");
  }

  if (outputFormat === "json") {
    try {
      const data = JSON.parse(content);
      return asJson({ parsed: true, format: "json", data: data as object, source, url: rawUrl });
    } catch {
      throw new NodeExecutionError("Document is not valid JSON but output format is JSON.");
    }
  }
  return asJson({ parsed: true, format: "text", text: content, length: content.length, parseMode, source, url: rawUrl });
}

function executeApproval(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const title = resolveTemplateString(config.title ?? "Approval requested", input);
  const description = resolveTemplateString(config.description ?? "", input);
  // Auto-approve only when explicitly enabled in the node config. When disabled the
  // node fails loudly because no human approval inbox is wired up yet — it must not
  // silently approve.
  const autoApprove = config.autoApprove === true;
  if (!autoApprove) {
    throw new NodeExecutionError(
      "Approval node requires human sign-off but no approval system is configured. Enable 'Auto Approve' in the node config to proceed without review."
    );
  }
  const base = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return asJson({
    ...base,
    approved: true,
    autoApproved: true,
    title: title as string,
    description: description as string,
    approverSource: typeof config.approverSource === "string" ? config.approverSource : "email",
    approverEmail: typeof config.approverEmail === "string" ? config.approverEmail : undefined,
    branch: "approved",
  });
}

// Optional in-process fast path. Only correct for a single, never-restarting
// process — the durable database store is the default for exactly this reason.
const memoryKeys = new Map<string, { at: number; ttlMs: number }>();

function executeIdempotency(node: WorkflowNode, input: Prisma.JsonValue | undefined): Promise<Prisma.JsonValue> {
  const config = configFor(node);
  const expression = typeof config.keyExpression === "string" ? config.keyExpression : "{{eventId}}";
  const resolved = resolveTemplateString(expression, input);
  const keySource = expression.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, "$1").trim();
  const keyValue = keySource ? valueAt(input, keySource) : undefined;
  const key = `flux:${node.id}:${keyValue !== undefined ? String(keyValue) : resolved}`;
  const ttl = typeof config.ttl === "number" ? Math.min(config.ttl, 7 * 86_400) : 3_600;
  const label = keySource || "(expression)";

  if (config.store === "memory") {
    const now = Date.now();
    const existing = memoryKeys.get(key);
    const isDuplicate = !!existing && now - existing.at < existing.ttlMs;
    if (!isDuplicate) {
      memoryKeys.set(key, { at: now, ttlMs: ttl * 1000 });
      if (memoryKeys.size > 10_000) {
        for (const [k, v] of memoryKeys) if (now - v.at > v.ttlMs) memoryKeys.delete(k);
      }
    }
    return Promise.resolve(
      asJson(isDuplicate ? { duplicate: true, key: label, branch: "duplicate" } : { duplicate: false, key: label, branch: "main" })
    );
  }

  // Durable store (default). Atomic claim: the first worker to insert wins,
  // every other worker sees the row and gets "duplicate". Survives restarts
  // and dedupes correctly across any number of worker replicas.
  return prisma.$executeRaw`
    INSERT INTO "IdempotencyKey" ("id", "nodeId", "key", "expiresAt")
    VALUES (${key}, ${node.id}, ${key}, now() + (${ttl} || ' seconds')::interval)
    ON CONFLICT ("id") DO NOTHING
  `.then((inserted) =>
    inserted > 0
      ? asJson({ duplicate: false, key: label, branch: "main" })
      : asJson({ duplicate: true, key: label, branch: "duplicate" })
  );
}

function executeMerge(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const mode = typeof config.mode === "string" ? config.mode : "append";
  const base = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return asJson({ ...base, merged: true, mergeMode: mode });
}

function executeSplit(node: WorkflowNode, input: Prisma.JsonValue | undefined): Prisma.JsonValue {
  const config = configFor(node);
  const batchSize = typeof config.batchSize === "number" && config.batchSize > 0 ? config.batchSize : 10;
  let items: unknown[] | undefined;
  if (Array.isArray(input)) items = input;
  else if (input && typeof input === "object") {
    const candidate = valueAt(input, "items") ?? valueAt(input, "data");
    if (Array.isArray(candidate)) items = candidate;
  }
  if (!items) return asJson({ batches: [], count: 0, batchSize });
  const batches: unknown[][] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  return asJson({ batches: batches as Prisma.JsonValue[][], count: items.length, batchSize });
}

async function executeAi(node: WorkflowNode, input: Prisma.JsonValue | undefined): Promise<Prisma.JsonValue> {
  const config = configFor(node);
  const rawPrompt = config.prompt ?? "Summarize the input data.";
  const prompt = resolveTemplateString(rawPrompt, input);
  const systemPrompt = typeof config.systemPrompt === "string" ? config.systemPrompt : undefined;
  const provider = typeof config.provider === "string" ? config.provider : "openai";
  const model = typeof config.model === "string" && config.model ? config.model : "gpt-4o-mini";
  const temperature = typeof config.temperature === "number" ? Math.max(0, Math.min(config.temperature, 2)) : 0.7;
  const maxTokens = typeof config.maxTokens === "number" ? Math.max(64, Math.min(config.maxTokens, 2048)) : 512;
  const jsonMode = config.jsonMode === true;

  // User-provided API key takes priority over platform key
  const userApiKey = typeof config.apiKey === "string" && config.apiKey.length > 0 ? config.apiKey : undefined;
  const apiKey = userApiKey ?? process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";

  const base = model.includes("/") ? model : `openai/${model}`;
  // Documented fallback: in development a missing key or any provider failure
  // (rate limit, bad key, timeout, network) yields a clearly flagged mock
  // result — `mock: true` + note — so templates run out of the box and the gap
  // stays visible in the node output. In production the same conditions FAIL
  // the node loudly instead, because a silently-mocked AI response would let a
  // workflow report SUCCESS with fake content and nobody could tell.
  const mockFallback = (note: string): Prisma.JsonValue => {
    failLoudInProduction(note);
    console.warn(`[ai] ${note} — returning mock AI result.`);
    return asJson({
      provider,
      model: base,
      result: `Mock AI response — provider not reached. Prompt was: ${String(prompt).slice(0, 300)}`,
      usingUserKey: !!userApiKey,
      mock: true,
      note,
    });
  };

  if (!apiKey) {
    return mockFallback(
      "No AI API key configured. Add your OpenRouter key in the AI node config or set AI_API_KEY in the environment."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": "https://fluxforwork.live",
        "x-title": "FluX Workflow Engine",
      },
      body: JSON.stringify({
        model: base,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: String(prompt) },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return mockFallback(`AI provider returned ${response.status}: ${detail}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return mockFallback("AI provider returned an empty response.");
    let result: unknown = content.slice(0, 4_000);
    if (jsonMode) {
      try {
        const parsed: unknown = JSON.parse(content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          // JSON mode: expose the parsed fields at the top level so downstream
          // nodes and branch conditions can reference them directly ({{service}})
          // — and so they survive a condition node, which spreads its input but
          // overwrites `result` with the boolean branch value.
          return asJson({ ...(parsed as Record<string, unknown>), provider, model: base, usingUserKey: !!userApiKey, result: parsed });
        }
        result = parsed;
      } catch {
        // Provider advertised JSON mode but returned non-JSON — keep the raw text.
      }
    }
    return asJson({ provider, model: base, result, usingUserKey: !!userApiKey });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return mockFallback("AI request timed out.");
    return mockFallback(`AI request failed: ${(error instanceof Error ? error.message : "Unknown AI error.").slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function runNodeCore(
  node: WorkflowNode,
  input: Prisma.JsonValue | undefined,
  ctx: ExecutionContext
): Promise<Prisma.JsonValue> {
  switch (node.type) {
    case "trigger":
      return input ?? {};
    case "http":
      return executeHttp(node, input);
    case "webhook":
      return executeWebhook(node, input);
    case "ai":
      return executeAi(node, input);
    case "condition":
      return executeCondition(node, input);
    case "switch":
      return executeSwitch(node, input);
    case "filter":
      return executeFilter(node, input);
    case "code":
      return executeCode(node, input);
    case "set":
      return executeSet(node, input);
    case "auth":
      return executeAuth(node, input);
    case "error":
      return executeError(node, input);
    case "approval":
      return executeApproval(node, input);
    case "idempotency":
      return executeIdempotency(node, input);
    case "merge":
      return executeMerge(node, input);
    case "split":
      return executeSplit(node, input);
    case "document":
      return executeDocument(node, input);
    case "email": {
      const emailConfig = configFor(node);
      const to = resolveTemplateString(typeof emailConfig.to === "string" ? emailConfig.to : typeof emailConfig.recipient === "string" ? emailConfig.recipient : "user@example.com", input) as string;
      if (process.env.NODE_ENV === "production" && to.trim().toLowerCase() === "user@example.com") {
        throw new NodeExecutionError(
          'Email node still has the placeholder recipient "user@example.com" — set a real address in the node\'s "To" field before running in production.'
        );
      }
      const subject = resolveTemplateString(typeof emailConfig.subject === "string" ? emailConfig.subject : "Workflow notification", input) as string;
      const body = resolveTemplateString(typeof emailConfig.body === "string" ? emailConfig.body : "Your workflow has completed.", input) as string;
      const isHtml = typeof emailConfig.isHtml === "boolean" ? emailConfig.isHtml : false;
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@flux.dev";
      const transporter = getSmtpTransporter();

      if (transporter) {
        // Real email via SMTP
        const info = await transporter.sendMail({ from, to, subject, [isHtml ? "html" : "text"]: body });
        return asJson({
          status: "SUCCESS" as const,
          output: {
            sent: true,
            mock: false,
            to,
            subject,
            bodyPreview: body.slice(0, 200),
            isHtml,
            messageId: info.messageId,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // No SMTP configured — outside production, simulate (logged for verification).
      // In production an unconfigured SMTP must fail rather than claim a fake send.
      failLoudInProduction("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS to send emails.");
      console.log(`[email] SIMULATED → To: ${to} | Subject: ${subject} | Body: ${body.slice(0, 120)}`);
      return asJson({
        status: "SUCCESS" as const,
        output: {
          sent: true,
          mock: true,
          to,
          subject,
          bodyPreview: body.slice(0, 200),
          isHtml,
          messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          note: "SMTP not configured. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to send real emails.",
        },
      });
    }
    case "slack": {
      const slackConfig = configFor(node);
      const rawUrl = resolveTemplateString(slackConfig.webhookUrl, input);
      const webhookUrl = typeof rawUrl === "string" && rawUrl.length > 0 ? rawUrl : undefined;
      const channel = typeof slackConfig.channel === "string" ? slackConfig.channel : undefined;
      const message = resolveTemplateString(typeof slackConfig.message === "string" ? slackConfig.message : "Hello from FluX", input) as string;
      const username = typeof slackConfig.username === "string" ? slackConfig.username : undefined;
      const iconEmoji = typeof slackConfig.iconEmoji === "string" ? slackConfig.iconEmoji : undefined;
      if (!webhookUrl) {
        // Unconfigured service. Fails loudly in production; documented mock in dev.
        failLoudInProduction("Slack node has no webhook URL configured. Add an incoming webhook URL in the node config to send real messages.");
        console.warn("[slack] No webhook URL configured — returning mock send. Add a webhook URL in the node config.");
        return asJson({
          status: "SUCCESS" as const,
          output: {
            sent: false,
            mock: true,
            channel: channel || "#general",
            message,
            username: username || "FluX Bot",
            note: "Slack node has no webhook URL configured. Add an incoming webhook URL in the node config to send real messages.",
          },
        });
      }
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: channel || "#general",
            text: message,
            username: username || "FluX Bot",
            icon_emoji: iconEmoji || ":zap:",
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await res.text();
        // A non-2xx means Slack rejected the payload (bad/revoked webhook token,
        // wrong channel, invalid format). This MUST surface as a real failure —
        // reporting sent:true here would mask a delivery failure as success.
        if (!res.ok) {
          const reason = body.trim().slice(0, 300) || "no response body";
          throw new NodeExecutionError(`Slack webhook rejected the message (HTTP ${res.status}): ${reason}`);
        }
        return asJson({ status: "SUCCESS" as const, output: { statusCode: res.status, slackResponse: body, sent: true, channel: channel || "#general", message, username: username || "FluX Bot", webhookUrl: webhookUrl.slice(0, 50) + "..." } });
      } catch (error) {
        throw new NodeExecutionError(`Slack webhook failed: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
    case "loop": {
      const loopConfig = configFor(node);
      const inputPath = typeof loopConfig.inputPath === "string" ? loopConfig.inputPath : "items";
      const batchSize = typeof loopConfig.batchSize === "number" && loopConfig.batchSize > 0 ? loopConfig.batchSize : 10;
      const itemCode = typeof loopConfig.itemCode === "string" && loopConfig.itemCode.trim() ? loopConfig.itemCode : null;
      const inputObj = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
      const arrayValue = valueAt(inputObj as Prisma.JsonValue, inputPath);
      if (!Array.isArray(arrayValue)) {
        return asJson({ results: [], batches: [], totalItems: 0, batchSize, batchCount: 0, processed: 0, errors: [], branch: "done" });
      }

      // Real per-item iteration. Without an expression the items pass through
      // unchanged (still grouped into batches for downstream consumers); with
      // an expression each item is transformed in the same sandboxed VM the
      // Code node uses, so the loop genuinely processes every element.
      const errors: Array<{ index: number; error: string }> = [];
      let processed = 0;
      const results: unknown[] = itemCode
        ? await Promise.all(
            arrayValue.map(async (item, index) => {
              try {
                return await runItemExpression(itemCode, item, index, input);
              } catch (error) {
                errors.push({ index, error: error instanceof Error ? error.message : "Item failed." });
                return null;
              }
            })
          )
        : [...arrayValue];

      if (itemCode) {
        processed = results.filter((r) => r != null).length;
        // A failing item shouldn't silently look successful: surface the first
        // failure as the node's error so the run is marked FAILED.
        if (errors.length) {
          throw new NodeExecutionError(
            `Loop failed on ${errors.length} of ${arrayValue.length} item(s). First failure (item ${errors[0].index}): ${errors[0].error}`
          );
        }
      } else {
        processed = arrayValue.length;
      }

      const batches: unknown[][] = [];
      for (let i = 0; i < results.length; i += batchSize) batches.push(results.slice(i, i + batchSize));
      return asJson({
        results: results as Prisma.JsonValue[],
        batches: batches as Prisma.JsonValue[][],
        totalItems: arrayValue.length,
        batchSize,
        batchCount: batches.length,
        processed,
        errors,
        branch: "done",
      });
    }
    case "wait":
    case "delay": {
      const waitConfig = configFor(node);
      const waitType = typeof waitConfig.waitType === "string" ? waitConfig.waitType : typeof waitConfig.delayType === "string" ? waitConfig.delayType : "delay";
      let ms: number;
      let untilIso: string | undefined;
      let unit: string | undefined;
      if (waitType === "until") {
        // Support an explicit target date/timestamp when provided.
        const targetRaw = resolveTemplateString(waitConfig.until ?? waitConfig.targetDate ?? waitConfig.date, input);
        const targetMs = typeof targetRaw === "string" || typeof targetRaw === "number" ? Date.parse(String(targetRaw)) : NaN;
        if (Number.isNaN(targetMs)) {
          throw new NodeExecutionError("Wait 'until' requires a valid target date. Set 'Until Date' in the node config.");
        }
        ms = Math.max(0, targetMs - Date.now());
        untilIso = new Date(targetMs).toISOString();
      } else {
        const duration = typeof waitConfig.duration === "number" ? waitConfig.duration : 0;
        unit = typeof waitConfig.unit === "string" ? waitConfig.unit : "seconds";
        const units: Record<string, number> = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
        ms = Math.max(0, duration) * (units[unit] || 1000);
      }

      // Waits <= 30s sleep in-process; anything longer is persisted as a WAITING
      // node execution and resumed durably by the scheduler (restart-safe).
      const IN_PROCESS_WAIT_MS = 30_000;
      const MAX_WAIT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      if (ms > MAX_WAIT_MS) {
        throw new NodeExecutionError(`Wait of ${Math.round(ms / 1000)}s exceeds the 30 day maximum.`);
      }
      const summary: Record<string, unknown> = { waited: ms, ...(unit !== undefined ? { unit } : {}), ...(untilIso !== undefined ? { until: untilIso } : {}) };
      if (ms === 0) return asJson({ status: "SUCCESS" as const, output: summary });
      if (ms > IN_PROCESS_WAIT_MS) {
        return asJson({
          status: "SUCCESS" as const,
          output: summary,
          [FLUX_WAIT_KEY]: untilIso ?? new Date(Date.now() + ms).toISOString(),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
      return asJson({ status: "SUCCESS" as const, output: summary });
    }
    case "database": {
      const dbConfig = configFor(node);
      const operation = typeof dbConfig.operation === "string" ? dbConfig.operation : "findMany";
      let table = typeof dbConfig.table === "string" ? dbConfig.table.trim() : "";

      // Raw Query: only SELECT statements, executed as-is with optional $1... params.
      if (operation === "raw") {
        const rawSql = typeof dbConfig.sql === "string" ? dbConfig.sql.trim() : "";
        if (!rawSql) throw new NodeExecutionError("Raw Query requires a SQL statement. Set it in the node config.");
        if (!/^\s*select\b/i.test(rawSql) || /;\s*\S/.test(rawSql)) {
          throw new NodeExecutionError("Raw Query only supports a single SELECT statement.");
        }
        try {
          const rows = await prisma.$queryRawUnsafe(rawSql);
          return asJson({ status: "SUCCESS" as const, output: { records: rows, count: (rows as unknown[]).length } });
        } catch (dbError) {
          const code = extractPgCode(dbError);
          const raw = dbError instanceof Error ? dbError.message : "unknown DB error";
          if (code === "42P01") {
            const available = await listBusinessTables();
            throw new NodeExecutionError(
              `Raw Query failed: a table in the statement does not exist. Existing tables: ${available.length > 0 ? available.join(", ") : "none"}.`
            );
          }
          if (code === "42703") {
            throw new NodeExecutionError("Raw Query failed: a column in the statement does not exist. Check the column names against the table's schema.");
          }
          throw new NodeExecutionError(`Raw Query failed: ${raw}`);
        }
      }

      if (!table) {
        // Unconfigured node. In production this fails loudly — defaulting to an
        // unrelated demo table would let a run report SUCCESS over the wrong data
        // and nobody could tell. In development it defaults to a real seeded table
        // so templates run out of the box (never mock DB rows).
        failLoudInProduction("Database node has no table configured. Set a Table in the node config to query real data.");
        table = "customers";
        console.warn("[database] No table configured — defaulting to real table 'customers'. Set a Table in the node config.");
      }
      // Safety: allow any real table, but only when the name is a plain SQL
      // identifier (prevents injection — values are parameterized separately)
      // and never FluX's own internal tables (they store credentials/hashes).
      if (!isValidTableName(table)) {
        throw new NodeExecutionError(`Table name "${table}" is invalid. Use only letters, digits and underscores.`);
      }
      if (INTERNAL_TABLES.has(table.toLowerCase())) {
        throw new NodeExecutionError(`Table "${table}" is a FluX internal table and cannot be queried.`);
      }
      const safeTable = table;
      const autoCreate = dbConfig.autoCreate !== false;

      // Insert/update payload: prefer explicit UI "Data to Save", fall back to node input.
      const resolveData = (): Record<string, unknown> => {
        const dataObj = dbConfig.data;
        if (dataObj && typeof dataObj === "object" && !Array.isArray(dataObj)) {
          return resolveTemplateDeep(dataObj, input) as Record<string, unknown>;
        }
        return (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
      };

      // Writes plan their columns first (sanitized keys + inferred types) so a
      // missing table/column can be created instead of failing the run.
      const data = operation === "create" || operation === "update" ? resolveData() : null;
      const planResult = data ? planDataColumns(data) : null;
      if (planResult?.error) throw new NodeExecutionError(planResult.error);
      const plan = planResult?.plan ?? [];

      // Column metadata: drives owner scoping, schema-on-write and friendly errors.
      let tableColumns = await fetchTableColumns(safeTable);
      if (!tableColumns) {
        if (operation === "create" && autoCreate && plan.length > 0) {
          tableColumns = await createTableIfMissing(safeTable, plan);
        } else {
          const available = await listBusinessTables();
          throw new NodeExecutionError(
            `Table "${safeTable}" does not exist. Existing tables: ${available.length > 0 ? available.join(", ") : "none"}. ` +
              (operation === "create"
                ? 'Enable "Auto-Create Table" on this node to have FluX create it automatically on the next run.'
                : "Set a Table that exists, or add a Create node with \"Auto-Create Table\" enabled to create it first.")
          );
        }
      } else if (plan.length > 0 && (operation === "create" || operation === "update") && autoCreate) {
        tableColumns = await ensureDataColumns(safeTable, plan, tableColumns);
      }

      // Build WHERE clause from config.
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      const addEqCondition = (fieldRaw: unknown, value: unknown) => {
        const field = String(fieldRaw).replace(/[^a-zA-Z0-9_]/g, "");
        if (!field || value === undefined) return;
        conditions.push(`"${field}" = $${paramIdx}`);
        params.push(value);
        paramIdx++;
      };

      // Structured conditions: [{ field, op, value }]
      const configConditions = Array.isArray(dbConfig.conditions) ? dbConfig.conditions : [];
      for (const cond of configConditions) {
        if (cond.field && cond.op && cond.value !== undefined) {
          const safeOps = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "ILIKE"];
          const op = safeOps.includes(String(cond.op).toUpperCase()) ? String(cond.op) : "=";
          // Only allow alphanumeric + underscore field names to prevent identifier injection
          const field = String(cond.field).replace(/[^a-zA-Z0-9_]/g, "");
          if (!field) continue;
          // Escape LIKE/ILIKE wildcards so user values match literally
          let safeValue = cond.value;
          if ((op.toUpperCase() === "LIKE" || op.toUpperCase() === "ILIKE") && typeof safeValue === "string") {
            safeValue = safeValue.replace(/([\\%_])/g, "\\$1");
          }
          conditions.push(`"${field}" ${op} $${paramIdx}`);
          params.push(safeValue);
          paramIdx++;
        }
      }

      // UI "Filter Conditions" object: { status: "active", tier: "vip" } → equality match.
      const whereObj = dbConfig.where;
      if (whereObj && typeof whereObj === "object" && !Array.isArray(whereObj)) {
        for (const [field, value] of Object.entries(whereObj as Record<string, unknown>)) {
          addEqCondition(field, resolveTemplateDeep(value, input));
        }
      }

      // Support simple filter from input: e.g. { filterField: "tier", filterValue: "vip" }
      const filterField = typeof dbConfig.filterField === "string" ? dbConfig.filterField : "";
      const filterValue = dbConfig.filterValue;
      if (filterField && filterValue !== undefined) addEqCondition(filterField, filterValue);

      // Filters explicitly written by the user (used to enforce the
      // update/delete "never touch every row" rule even after owner scoping).
      const userConditionCount = conditions.length;

      // Owner scoping: tables that carry an owner_id column only ever expose the
      // current workflow owner's rows (fail-closed: no owner → owner_id IS NULL).
      // Legacy demo tables (customers/orders/tickets) have no owner_id and stay shared.
      if (operation !== "create" && tableColumns.has("owner_id")) {
        if (ctx.ownerId) {
          conditions.push(`"owner_id" = $${paramIdx}`);
          params.push(ctx.ownerId);
          paramIdx++;
        } else {
          conditions.push(`"owner_id" IS NULL`);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = typeof dbConfig.limit === "number" ? Math.min(dbConfig.limit, 100) : 50;

      try {
          switch (operation) {
            case "findMany": {
              const sql = `SELECT * FROM "${safeTable}" ${whereClause} LIMIT $${paramIdx}`;
              params.push(limit);
              const rows = await prisma.$queryRawUnsafe(sql, ...params);
              return asJson({ status: "SUCCESS" as const, output: { records: rows, count: (rows as unknown[]).length, table: safeTable } });
            }
            case "findOne": {
              const sql = `SELECT * FROM "${safeTable}" ${whereClause} LIMIT 1`;
              const rows = await prisma.$queryRawUnsafe(sql, ...params) as unknown[];
              return asJson({ status: "SUCCESS" as const, output: { record: rows[0] ?? null, table: safeTable } });
            }
            case "create": {
              if (plan.length === 0) throw new NodeExecutionError("Create requires data fields. Set 'Data to Save' in the node config.");
              const names: string[] = [];
              const placeholders: string[] = [];
              const values: unknown[] = [];
              let idx = 1;
              for (const column of plan) {
                const serialized = serializeParam(data![column.sourceKey], tableColumns.get(column.key));
                names.push(`"${column.key}"`);
                placeholders.push(`$${idx}${serialized.cast}`);
                values.push(serialized.value);
                idx++;
              }
              if (tableColumns.has("owner_id")) {
                names.push(`"owner_id"`);
                placeholders.push(`$${idx}`);
                values.push(ctx.ownerId ?? null);
              }
              const rows = await prisma.$queryRawUnsafe(
                `INSERT INTO "${safeTable}" (${names.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
                ...values
              ) as unknown[];
              return asJson({ status: "SUCCESS" as const, output: { record: rows[0], created: true, table: safeTable } });
            }
            case "update": {
              if (plan.length === 0) throw new NodeExecutionError("Update requires data fields. Set 'Data to Save' in the node config.");
              if (userConditionCount === 0) {
                throw new NodeExecutionError("Update requires filter conditions — refusing to update every row. Set 'Filter Conditions' in the node config.");
              }
              // WHERE placeholders occupy $1..$n — SET params must be numbered after them.
              const setClauses: string[] = [];
              const values: unknown[] = [];
              let idx = conditions.length + 1;
              for (const column of plan) {
                const serialized = serializeParam(data![column.sourceKey], tableColumns.get(column.key));
                setClauses.push(`"${column.key}" = $${idx}${serialized.cast}`);
                values.push(serialized.value);
                idx++;
              }
              const sql = `UPDATE "${safeTable}" SET ${setClauses.join(", ")} ${whereClause} RETURNING *`;
              const rows = await prisma.$queryRawUnsafe(sql, ...params, ...values) as unknown[];
              return asJson({ status: "SUCCESS" as const, output: { record: rows[0], updated: (rows as unknown[]).length, table: safeTable } });
            }
            case "delete": {
              if (userConditionCount === 0) {
                throw new NodeExecutionError("Delete requires filter conditions — refusing to delete all rows. Set 'Filter Conditions' in the node config.");
              }
              const sql = `DELETE FROM "${safeTable}" ${whereClause} RETURNING *`;
              const rows = await prisma.$queryRawUnsafe(sql, ...params) as unknown[];
              return asJson({ status: "SUCCESS" as const, output: { deleted: (rows as unknown[]).length, table: safeTable } });
            }
            case "count": {
              const sql = `SELECT COUNT(*)::int as count FROM "${safeTable}" ${whereClause}`;
              const rows = await prisma.$queryRawUnsafe(sql, ...params) as unknown[];
              return asJson({ status: "SUCCESS" as const, output: { count: (rows as { count?: number }[])[0]?.count ?? 0, table: safeTable } });
            }
            default:
              throw new NodeExecutionError(`Unknown database operation: ${operation}.`);
          }
        } catch (dbError) {
        if (dbError instanceof NodeExecutionError) throw dbError;
        // DB connection/query failed — translate known PostgreSQL errors into
        // actionable guidance; anything else keeps the raw message.
        const friendly = await friendlyDbError(dbError, { table: safeTable, columns: tableColumns });
        const raw = dbError instanceof Error ? dbError.message : "unknown DB error";
        throw new NodeExecutionError(`Database ${operation} failed: ${friendly ?? raw}`);
      }
    }
    default:
      throw new NodeExecutionError(`Unsupported node type: ${node.type}.`);
  }
}

/**
 * Executes one node with **context passthrough**: the node's own output keys
 * win, but every field the node received is kept. Downstream nodes and branch
 * conditions can therefore reference data from any earlier node ({{service}},
 * {{trigger.body.*}}, …) even through chains like condition → http → slack →
 * database, where each node previously replaced the context and silently
 * blanked every reference. Branching/merging nodes already spread their input,
 * so for them this merge is a no-op.
 */
export async function executeNode(
  node: WorkflowNode,
  input: Prisma.JsonValue | undefined,
  ctx: ExecutionContext = {}
): Promise<Prisma.JsonValue> {
  const output = await runNodeCore(node, input, ctx);
  if (!input || typeof input !== "object" || Array.isArray(input)) return output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  return { ...(input as Record<string, unknown>), ...(output as Record<string, unknown>) } as Prisma.JsonValue;
}
