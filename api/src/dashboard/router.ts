import { Router } from "express";
import { prisma } from "../db.js";
import { resolveAuthUser, ApiKeyError, AuthError } from "../development-user.js";
import { createKafka } from "../execution/kafka.js";

const router = Router();

// Dashboard stats
router.get("/stats", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    const [workflowCount, executionCount, successCount, failedCount, runningCount, recentExecutions] = await Promise.all([
      prisma.workflow.count({ where: { userId } }),
      prisma.workflowExecution.count({ where: { workflow: { userId } } }),
      prisma.workflowExecution.count({ where: { workflow: { userId }, status: "SUCCESS" } }),
      prisma.workflowExecution.count({ where: { workflow: { userId }, status: "FAILED" } }),
      // "Running" = still in flight: queued (PENDING) or actively executing
      // (RUNNING). Local-mode runs pass through RUNNING in milliseconds, so
      // counting only RUNNING made the dashboard stat read 0 unless a durable
      // wait happened to be parked at that exact instant.
      prisma.workflowExecution.count({ where: { workflow: { userId }, status: { in: ["PENDING", "RUNNING"] } } }),
      prisma.workflowExecution.findMany({
        where: { workflow: { userId } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { workflow: { select: { name: true } } },
      }),
    ]);

    const payload = {
      totalWorkflows: workflowCount,
      totalExecutions: executionCount,
      successRate: executionCount > 0 ? Math.round((successCount / executionCount) * 100) : 0,
      successCount,
      failedCount,
      runningCount,
      recentExecutions,
    };
    console.log(`[stats] user=${userId} -> workflows=${payload.totalWorkflows} execs=${payload.totalExecutions} rate=${payload.successRate}% running=${payload.runningCount}`);
    res.json(payload);
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Stats fetch error:", error);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
});

// Activity feed
router.get("/activity", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    const logs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ activities: logs });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Activity fetch error:", error);
    res.status(500).json({ error: "Failed to fetch activity." });
  }
});

// System status — checks Kafka, Postgres, API.
// Authenticated: reveals infrastructure status, so don't expose it anonymously.
router.get("/system-status", async (req, res) => {
  try {
    await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("System status auth error:", error);
    return res.status(500).json({ error: "Failed to check system status." });
  }

  const statuses: Array<{ label: string; status: string; ok: boolean }> = [];

  // API — if we're responding, it's up
  statuses.push({ label: "API Server", status: "operational", ok: true });

  // Postgres — run a lightweight query
  try {
    await prisma.$queryRaw`SELECT 1`;
    statuses.push({ label: "Database", status: "operational", ok: true });
  } catch {
    statuses.push({ label: "Database", status: "degraded", ok: false });
  }

  // Kafka — only required in distributed mode; otherwise do a REAL metadata
  // fetch against the brokers instead of pretending the env var means "up".
  const executionMode = (process.env.EXECUTION_MODE ?? "").trim().toLowerCase() || "local";
  if (executionMode !== "distributed") {
    statuses.push({ label: "Kafka Broker", status: "local mode (not required)", ok: true });
  } else if (!process.env.KAFKA_BROKERS?.trim()) {
    statuses.push({ label: "Kafka Broker", status: "misconfigured (KAFKA_BROKERS unset)", ok: false });
  } else {
    const admin = createKafka().admin();
    try {
      const connect = admin.connect();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Kafka connect timed out after 5s")), 5_000)
      );
      await Promise.race([connect, timeout]);
      await admin.listTopics();
      statuses.push({ label: "Kafka Broker", status: "operational", ok: true });
    } catch {
      statuses.push({ label: "Kafka Broker", status: "unreachable", ok: false });
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  res.json({ services: statuses });
});

// All executions across all workflows
router.get("/executions", async (req, res) => {
  try {
    const { userId } = await resolveAuthUser(req.headers as Record<string, string | undefined>, prisma);

    const executions = await prisma.workflowExecution.findMany({
      where: { workflow: { userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        workflow: { select: { name: true, id: true } },
        nodeExecutions: {
          include: { node: { select: { name: true, type: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.json({ executions });
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AuthError) {
      return res.status(401).json({ error: error.message });
    }
    console.error("Executions fetch error:", error);
    res.status(500).json({ error: "Failed to fetch executions." });
  }
});

export default router;
