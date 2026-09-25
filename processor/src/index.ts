import { Kafka, logLevel } from "kafkajs";
import { prisma } from "../../api/src/db.js";
import { assertDatabaseReachable, validateServiceEnv } from "../../api/src/config.js";
import { publishPendingOutboxEvents } from "../../api/src/execution/outbox-publisher.js";

const executionMode = (process.env.EXECUTION_MODE ?? "").trim().toLowerCase() || "local";
const kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);

const kafka = new Kafka({
  clientId: "flux-processor",
  brokers: kafkaBrokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 1_000,
    retries: 10,
    factor: 2,
    maxRetryTime: 30_000,
  },
});

const producer = kafka.producer({ allowAutoTopicCreation: true });

/** Connect with exponential backoff so a broker that isn't up yet doesn't kill the process. */
async function connectWithRetry(maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await producer.connect();
      console.log("Connected to Kafka producer.");
      return;
    } catch (err) {
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 30_000);
      console.error(
        `Kafka producer connect failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === maxAttempts) throw err;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function start() {
  // In local mode the API writes no outbox events — exit instead of crash-looping.
  if (executionMode !== "distributed") {
    console.log('[processor] EXECUTION_MODE is not "distributed" — no outbox events to publish. Exiting cleanly.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Fail fast on missing config / unreachable database before connecting.
  try {
    validateServiceEnv("processor");
    await assertDatabaseReachable(prisma);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`Starting FluX Outbox Processor... Connecting to Kafka at ${kafkaBrokers.join(",")}`);
  await connectWithRetry();

  let running = true;

  const shutdown = async () => {
    console.log("Shutting down processor...");
    running = false;
    try {
      await producer.disconnect();
      await prisma.$disconnect();
    } catch {
      // ignore shutdown errors
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let consecutiveFailures = 0;
  while (running) {
    try {
      const result = await publishPendingOutboxEvents(prisma, producer, 20);
      consecutiveFailures = 0;
      if (result.publishedCount > 0) {
        console.log(`Published ${result.publishedCount} outbox events to Kafka.`);
      }
    } catch (err) {
      consecutiveFailures++;
      console.error("Error during outbox event processing:", err);
      // Back off when Kafka/DB is unhealthy to avoid hammering it.
      if (consecutiveFailures >= 3) {
        const backoff = Math.min(1_000 * 2 ** (consecutiveFailures - 3), 30_000);
        console.log(`Backing off for ${backoff}ms after ${consecutiveFailures} failures.`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

start().catch((err) => {
  console.error("Processor failed to start:", err);
  process.exit(1);
});