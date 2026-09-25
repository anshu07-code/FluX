import type { WorkflowEdge, WorkflowNode, WorkflowNodeData, WorkflowNodeType } from "@/components/workflow-types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type PersistedNode = {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
};

type PersistedEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  config: Record<string, unknown>;
};

export type PersistedWorkflow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  nodes: PersistedNode[];
  edges: PersistedEdge[];
  createdAt: string;
  updatedAt: string;
};

export type PersistedNodeExecution = {
  id: string;
  status: "PENDING" | "RUNNING" | "WAITING" | "SUCCESS" | "FAILED" | "SKIPPED";
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  node: { id: string; name: string; type: string };
};

export type PersistedExecution = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nodeExecutions: PersistedNodeExecution[];
};

export type WorkflowPayload = {
  name: string;
  nodes: Array<{ id: string; type: string; name: string; config: Record<string, unknown>; position: { x: number; y: number } }>;
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; config: Record<string, unknown> }>;
};

/**
 * Browser auth: the NextAuth session cookie → short-lived in-memory JWT cache.
 * No credential (API key, token, password) is ever written to localStorage or
 * sessionStorage — a stolen-then-XSS-readable secret is the whole account.
 */
let cachedSessionToken: { token: string | null; at: number } | null = null;
const SESSION_TOKEN_TTL_MS = 60_000;

async function sessionTokenHeader(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const now = Date.now();
  if (!cachedSessionToken || now - cachedSessionToken.at > SESSION_TOKEN_TTL_MS) {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { user?: { apiToken?: string | null } }) : null;
      cachedSessionToken = { token: data?.user?.apiToken ?? null, at: now };
    } catch {
      cachedSessionToken = { token: null, at: now };
    }
  }
  const token = cachedSessionToken.token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

function clearSessionTokenCache() {
  cachedSessionToken = null;
}

async function request<T>(path: string, options?: RequestInit, allowRecovery = true): Promise<T> {
  const sessionHeaders = await sessionTokenHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      // Never read from or store in the browser cache — conditional
      // (If-None-Match) requests came back as empty 304s and blanked the
      // dashboard even though the server had the data.
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...sessionHeaders,
        ...options?.headers,
      },
      signal: options?.signal ?? controller.signal,
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;

    if (response.status === 401 && allowRecovery) {
      // Drop the cached (possibly rotated/revoked) JWT and retry once with a
      // freshly fetched session token before surfacing the error.
      clearSessionTokenCache();
      return request<T>(path, options, false);
    }

    if (!response.ok) throw new Error(body?.error ?? "The workflow request failed.");
    return body as T;
  } catch (error) {
    // A hung request used to leave Promise.allSettled pending forever, freezing
    // the dashboard on whatever partial state it had. Time it out so every
    // load settles and the next refresh can retry.
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("The FluX API took too long to respond.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function saveNewWorkflow(payload: WorkflowPayload) {
  return request<{ workflow: PersistedWorkflow }>("/workflows", { method: "POST", body: JSON.stringify(payload) });
}

export function updateExistingWorkflow(id: string, payload: WorkflowPayload) {
  return request<{ workflow: PersistedWorkflow }>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function listWorkflows() {
  return request<{ workflows: PersistedWorkflow[] }>("/workflows");
}

export function getWorkflow(id: string) {
  return request<{ workflow: PersistedWorkflow }>(`/workflows/${id}`);
}

export function runWorkflow(id: string, input: Record<string, unknown> = {}) {
  return request<{ execution: PersistedExecution }>(`/workflows/${id}/run`, { method: "POST", body: JSON.stringify({ input }) });
}

export function getExecution(id: string) {
  return request<{ execution: PersistedExecution }>(`/executions/${id}`);
}

export function getDashboardStats() {
  return request<{
    totalWorkflows: number;
    totalExecutions: number;
    successRate: number;
    successCount: number;
    failedCount: number;
    runningCount: number;
    recentExecutions: Array<{ id: string; status: string; createdAt: string; workflow: { name: string } }>;
  }>("/dashboard/stats");
}

export function getActivity() {
  return request<{
    activities: Array<{
      id: string;
      action: string;
      resource: string;
      resourceId: string | null;
      details: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>("/dashboard/activity");
}

export function getSystemStatus() {
  return request<{
    services: Array<{ label: string; status: string; ok: boolean }>;
  }>("/dashboard/system-status");
}

export function getAllExecutions() {
  return request<{
    executions: Array<{
      id: string;
      status: string;
      error: string | null;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
      workflow: { name: string; id: string };
      nodeExecutions: Array<{
        id: string;
        status: string;
        error: string | null;
        input: unknown;
        output: unknown;
        startedAt: string | null;
        completedAt: string | null;
        node: { name: string; type: string };
      }>;
    }>;
  }>("/dashboard/executions");
}

export function updateProfile(data: { name?: string; email?: string; image?: string | null }) {
  return request<{ user: { id: string; email: string; name: string | null; image: string | null } }>("/auth/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** Current user profile, including `provider` (email vs OAuth). */
export function getCurrentUser() {
  return request<{
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: string;
      provider: string;
      createdAt: string;
    };
  }>("/auth/me");
}

export function changePassword(data: { currentPassword: string; newPassword: string }) {
  return request<{ message: string }>("/auth/password", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Permanently delete the authenticated account (cascades to workflows,
 * executions and API keys). `password` is required for email/password
 * accounts so a stolen session can't delete the account silently.
 */
export function deleteAccount(password?: string) {
  return request<void>("/auth/me", {
    method: "DELETE",
    body: JSON.stringify(password ? { password } : {}),
  });
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export type ApiKeyInfo = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function listApiKeys() {
  return request<{ apiKeys: ApiKeyInfo[] }>("/api-keys");
}

export function createApiKey(name: string) {
  return request<{ apiKey: ApiKeyInfo; rawKey: string }>("/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteApiKey(id: string) {
  return request<void>(`/api-keys/${id}`, { method: "DELETE" });
}

export function renameApiKey(id: string, name: string) {
  return request<{ apiKey: ApiKeyInfo }>(`/api-keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

// ─── Notification preferences (server-side) ──────────────────────────────────

export type UserPreferences = {
  /** Email the owner when one of their workflow runs fails. */
  failureEmailAlerts: boolean;
  /** Post the failure to Slack via the configured incoming webhook. */
  failureSlackAlerts: boolean;
  /** Slack incoming-webhook URL (https://hooks.slack.com/… only). */
  slackWebhookUrl: string | null;
};

export function getPreferences() {
  return request<{ preferences: UserPreferences }>("/auth/preferences");
}

export function savePreferences(update: Partial<UserPreferences>) {
  return request<{ preferences: UserPreferences }>("/auth/preferences", {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

// ─── Workflow Activation ────────────────────────────────────────────────

export function updateWorkflowStatus(id: string, status: "ACTIVE" | "DRAFT" | "ARCHIVED") {
  return request<{ workflow: PersistedWorkflow }>(`/workflows/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getWebhookUrl(workflowId: string): string {
  // Respect NEXT_PUBLIC_API_URL when set so the displayed URL works in production.
  const base = apiUrl === "http://localhost:4000"
    ? (typeof window !== "undefined" ? (window as unknown as { NEXT_PUBLIC_API_URL?: string }).NEXT_PUBLIC_API_URL ?? apiUrl : apiUrl)
    : apiUrl;
  return `${base}/webhooks/${workflowId}`;
}

export function deleteWorkflow(id: string) {
  return request<void>(`/workflows/${id}`, { method: "DELETE" });
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

export function toCanvasGraph(workflow: PersistedWorkflow): { id: string; name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      position: node.position,
      data: { config: node.config, label: node.name, type: node.type as WorkflowNodeType } as WorkflowNodeData,
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle: typeof edge.config?.branch === "string" ? edge.config.branch : "main",
      animated: true,
      data: edge.config,
    })),
  };
}
