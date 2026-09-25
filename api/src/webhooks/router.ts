import { Router } from "express";
import { prisma } from "../db.js";
import { startWorkflow } from "../execution/service.js";
import { validateExecutableGraph } from "../execution/graph-validation.js";

const router = Router();

/**
 * Webhook receiver — triggers a workflow when an external service sends an HTTP POST.
 * No API key required; the workflowId acts as a shared secret.
 *
 * POST /webhooks/:workflowId          (e.g. /webhooks/clx123...)
 * POST /webhooks/my/custom/path       (custom trigger webhookPath, multi-segment OK)
 * Body: any JSON object (passed as `input` to the workflow)
 */
// Regex route so custom webhook paths may contain multiple segments
// (Express 5: RegExp captures are exposed as req.params[0]).
router.post(/^\/(.+)$/, async (req, res) => {
  try {
    const routeKey = (req.params as Record<string, string>)[0] ?? "";

    // Match by workflow ID first, then by the trigger node's custom webhookPath
    // (e.g. "my-webhook" or "/my-webhook").
    const trimmedPath = routeKey.replace(/^\/+/, "").replace(/\/+$/, "");
    let workflow = await prisma.workflow.findFirst({
      where: { id: routeKey, status: "ACTIVE" },
      include: {
        nodes: { orderBy: { sortOrder: "asc" as const } },
        edges: { orderBy: { sortOrder: "asc" as const } },
      },
    });

    if (!workflow && trimmedPath) {
      const candidates = await prisma.workflow.findMany({
        where: {
          status: "ACTIVE",
          nodes: { some: { type: "trigger" } },
        },
        include: {
          nodes: { orderBy: { sortOrder: "asc" as const } },
          edges: { orderBy: { sortOrder: "asc" as const } },
        },
        take: 500,
      });
      workflow =
        candidates.find((wf) =>
          wf.nodes.some((node) => {
            if (node.type !== "trigger") return false;
            const cfg = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config as Record<string, unknown> : {};
            if (cfg.triggerType && cfg.triggerType !== "webhook") return false;
            const p = typeof cfg.webhookPath === "string" ? cfg.webhookPath.trim().replace(/^\/+|\/+$/g, "") : "";
            return p.length > 0 && p === trimmedPath;
          })
        ) ?? null;
    }

    // Load workflow (no auth required — the webhook path is the "secret")
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found or not active." });
    }

    // Trigger-type guard: cron/manual-only workflows must not be fireable over
    // this unauthenticated route. Their webhook URL is never shown in the UI
    // (the builder only shows it for webhook triggers), and manual runs go
    // through the authenticated /run endpoint. The path matcher above applies
    // the same rule; this covers the by-ID branch.
    const triggerNode = workflow.nodes.find((node) => node.type === "trigger");
    const triggerCfg =
      triggerNode?.config && typeof triggerNode.config === "object" && !Array.isArray(triggerNode.config)
        ? (triggerNode.config as Record<string, unknown>)
        : {};
    if (triggerCfg.triggerType && triggerCfg.triggerType !== "webhook") {
      return res.status(404).json({ error: "Workflow not found or not active." });
    }

    const validationErrors = validateExecutableGraph(workflow);
    if (validationErrors.length > 0) {
      return res.status(422).json({ error: "Workflow graph is invalid.", details: validationErrors });
    }

    // Accept any JSON body as workflow input. Builder docs and template
    // descriptions reference the payload as `trigger.body.*`, so mirror it
    // under `trigger.body` while also keeping the raw fields at the top level
    // (so expressions like {{orderId}} keep working too).
    const body = typeof req.body === "object" && req.body !== null && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const input = { ...body, trigger: { body } };

    // Use the workflow's ID + current timestamp as idempotency key so
    // duplicate webhook deliveries don't create duplicate runs.
    const idempotencyKey = `${workflow.id}-${Date.now()}`;

    const result = await startWorkflow(
      workflow.id,
      { idempotencyKey, input },
      workflow.userId
    );

    const statusCode = result.invalid ? 422 : result.started ? 202 : 200;
    return res.status(statusCode).json({
      executionId: result.execution.id,
      status: result.execution.status,
      started: result.started,
      message: result.started
        ? "Workflow execution started."
        : result.invalid
        ? "Workflow graph is invalid."
        : "Execution already exists for this idempotency key.",
    });
  } catch (error) {
    console.error("[webhook] Error handling webhook:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export default router;