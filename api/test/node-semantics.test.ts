import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowNode } from "@prisma/client";
import { executeNode } from "../src/execution/node-executors.js";

function aiNode(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "ai-test",
    type: "ai",
    name: "AI Triage",
    config,
    position: { x: 0, y: 0 },
  } as unknown as WorkflowNode;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI node JSON mode", () => {
  it("parses the response and flattens fields so downstream nodes can reference them", async () => {
    const payload = { service: "payment-api", severity: "CRITICAL", is_critical: true, summary: "Disk full" };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    })));

    const output = (await executeNode(aiNode({ jsonMode: true, apiKey: "test-key", prompt: "triage", provider: "openai", model: "gpt-4o-mini" }), {})) as Record<string, unknown>;

    expect(output.service).toBe("payment-api");
    expect(output.is_critical).toBe(true);
    expect(output.result).toEqual(payload);
    expect(output.provider).toBe("openai");
  });

  it("keeps the raw string when JSON mode returns non-JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
    })));

    const output = (await executeNode(aiNode({ jsonMode: true, apiKey: "test-key", prompt: "triage", provider: "openai", model: "gpt-4o-mini" }), {})) as Record<string, unknown>;

    expect(output.result).toBe("not json at all");
    expect(output.service).toBeUndefined();
  });
});

describe("Condition node left value", () => {
  function conditionNode(config: Record<string, unknown>): WorkflowNode {
    return { id: "cond-test", type: "condition", name: "Condition", config, position: { x: 0, y: 0 } } as unknown as WorkflowNode;
  }

  it("evaluates {{template}} left values as values, not paths", async () => {
    const config = { leftValue: "{{is_critical}}", operator: "eq", rightValue: "true" };
    const critical = (await executeNode(conditionNode(config), { is_critical: true })) as Record<string, unknown>;
    const routine = (await executeNode(conditionNode(config), { is_critical: false })) as Record<string, unknown>;
    expect(critical.result).toBe(true);
    expect(routine.result).toBe(false);
  });

  it("still looks up bare dot-paths", async () => {
    const config = { leftValue: "output.status", operator: "eq", rightValue: "done" };
    const done = (await executeNode(conditionNode(config), { output: { status: "done" } })) as Record<string, unknown>;
    const pending = (await executeNode(conditionNode(config), { output: { status: "pending" } })) as Record<string, unknown>;
    expect(done.result).toBe(true);
    expect(pending.result).toBe(false);
  });

  it("treats an unresolved template as undefined", async () => {
    const config = { leftValue: "{{missing.field}}", operator: "eq", rightValue: "x" };
    const output = (await executeNode(conditionNode(config), {})) as Record<string, unknown>;
    expect(output.result).toBe(false);
  });
});
