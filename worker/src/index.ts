import { Kafka, logLevel } from "kafkajs";
import { prisma } from "../../api/src/db.js";
import { assertDatabaseReachable, validateServiceEnv } from "../../api/src/config.js";
import { EXECUTION_TOPIC, isValidNodeExecutionEvent } from "../../api/src/execution/events.js";
import { handleNodeExecutionEvent } from "../../api/src/execution/distributed-handler.js";

const executionMode = (process.env.EXECUTION_MODE ?? "").trim().toLowerCase() || "local";
const kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const groupId = process.env.KAFKA_GROUP_ID ?? "flux-worker-group";

const kafka = new Kafka({
  clientId: "flux-worker",
  brokers: kafkaBrokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 1_000,
    retries: 10,
    factor: 2,
    maxRetryTime: 30_000,
  },
});

const consumer = kafka.consumer({ groupId, allowAutoTopicCreation: true });

async function connectWithRetry(maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await consumer.connect();
      console.log("Worker connected to Kafka.");
      return;
    } catch (err) {
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 30_000);
      console.error(
        `Kafka consumer connect failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === maxAttempts) throw err;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function start() {
  // In local mode workflows execute inside the API — the worker must not
  // crash-loop trying to reach a Kafka broker that isn't required.
  if (executionMode !== "distributed") {
    console.log('[worker] EXECUTION_MODE is not "distributed" — nothing to consume. Exiting cleanly.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Fail fast on missing config / unreachable database before connecting.
  try {
    validateServiceEnv("worker");
    await assertDatabaseReachable(prisma);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`Starting FluX Worker... Connecting to Kafka at ${kafkaBrokers.join(",")}`);
  await connectWithRetry();

  // fromBeginning: true — with no committed offset for a partition (first
  // event ever, or a restart while backlog was uncommitted), start from the
  // earliest offset instead of the high watermark. Committed offsets always
  // win, so this only affects partitions we have never committed for.
  // fromBeginning: false silently dropped events that were published while
  // the worker was down — executions hung in PENDING forever.
  await consumer.subscribe({ topic: EXECUTION_TOPIC, fromBeginning: true });
  console.log(`Subscribed to topic: ${EXECUTION_TOPIC}`);

  const shutdown = async () => {
    console.log("Shutting down worker...");
    try {
      await consumer.disconnect();
      await prisma.$disconnect();
    } catch {
      // ignore shutdown errors
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      const messageString = message.value?.toString();

      // Helper: commit this offset so a malformed/unprocessable message
      // cannot block the partition forever (poison-pill protection).
      const commit = async () => {
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
        ]);
      };

      if (!messageString) {
        await commit();
        await heartbeat();
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(messageString);
      } catch (err) {
        console.error("Worker received non-JSON message; skipping:", err);
        await commit();
        await heartbeat();
        return;
      }

      if (!isValidNodeExecutionEvent(payload)) {
        console.error("Worker received invalid node execution event; skipping:", payload);
        await commit();
        await heartbeat();
        return;
      }

      console.log(
        `Worker processing event for workflow execution ${payload.workflowExecutionId}, node ${payload.nodeId}`
      );

      try {
        // Call reusable execution core logic via handler
        const result = await handleNodeExecutionEvent(prisma, payload);

        console.log(
          `Event processed. NodeExecution ${payload.nodeExecutionId} status: ${result.status}. Next events: ${result.nextEventsCreated}`
        );
      } catch (err) {
        // Processing failed (DB error, etc). Do NOT commit — the message will be
        // retried on the next poll. Log loudly so it is visible.
        console.error(
          `Failed to process event for NodeExecution ${payload.nodeExecutionId}; will retry:`,
          err
        );
        await heartbeat();
        return;
      }

      // Only commit offset after DB transaction succeeded
      await commit();
      await heartbeat();
    },
  });
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});