import { prisma } from "../db.js";
import { getSmtpTransporter, smtpFromAddress } from "../mail.js";
import { parsePreferences } from "../preferences.js";

/**
 * Failure alerts for the owner of a workflow (Settings → Notifications).
 *
 * Guarantees:
 *  - Exactly-once per execution: an atomic claim on failureNotifiedAt means
 *    Kafka redeliveries or concurrent local/distributed paths never double-send.
 *  - Never blocks or fails the execution: fire-and-forget with every error
 *    caught and logged. An alert problem must not turn into a workflow problem.
 *  - Best-effort delivery: if SMTP/Slack is unavailable the claim is consumed
 *    (no retry storm); the log says exactly what happened.
 */
export function scheduleFailureAlert(executionId: string): void {
  void (async () => {
    try {
      await notifyExecutionFailure(executionId);
    } catch (error) {
      console.warn(
        `[alerts] failure alert for execution ${executionId} could not be sent:`,
        error instanceof Error ? error.message : error
      );
    }
  })();
}

async function notifyExecutionFailure(executionId: string): Promise<void> {
  // Atomic exactly-once claim — only the first caller proceeds.
  const claim = await prisma.workflowExecution.updateMany({
    where: { id: executionId, status: "FAILED", failureNotifiedAt: null },
    data: { failureNotifiedAt: new Date() },
  });
  if (claim.count === 0) return;

  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    select: {
      error: true,
      completedAt: true,
      workflow: {
        select: {
          id: true,
          name: true,
          user: { select: { email: true, name: true, preferences: true } },
        },
      },
    },
  });
  if (!execution) return;

  const prefs = parsePreferences(execution.workflow.user.preferences);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const subject = `FluX alert: "${execution.workflow.name}" failed`;
  const body = [
    `Workflow "${execution.workflow.name}" FAILED.`,
    "",
    `Error: ${execution.error ?? "Unknown error"}`,
    `Failed at: ${(execution.completedAt ?? new Date()).toISOString()}`,
    `View: ${appUrl}/workflows/${execution.workflow.id}`,
  ].join("\n");

  const deliveries: Promise<void>[] = [];
  if (prefs.failureEmailAlerts) {
    deliveries.push(sendFailureEmail(execution.workflow.user.email, subject, body));
  }
  if (prefs.failureSlackAlerts && prefs.slackWebhookUrl) {
    deliveries.push(sendFailureSlack(prefs.slackWebhookUrl, `${subject}\n${body}`));
  }

  const results = await Promise.allSettled(deliveries);
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        `[alerts] delivery failed for execution ${executionId}:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }
}

function sendFailureEmail(to: string, subject: string, text: string): Promise<void> {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    // Honest simulation: the log states nothing was actually sent.
    console.log(`[alerts] SIMULATED failure alert email → ${to} | ${subject} (SMTP not configured)`);
    return Promise.resolve();
  }
  return transporter.sendMail({ from: smtpFromAddress(), to, subject, text }).then(() => undefined);
}

async function sendFailureSlack(webhookUrl: string, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}`);
    console.log(`[alerts] failure alert posted to Slack (HTTP ${response.status})`);
  } finally {
    clearTimeout(timer);
  }
}
