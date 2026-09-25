import { Kafka, logLevel } from "kafkajs";

// Retry config for Kafka connections
const MAX_RETRIES = 8;
const BASE_RETRY_DELAY_MS = 1_000;

/** Creates a Kafka instance with retry-friendly configuration. */
function createKafka(): Kafka {
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? "flux",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: BASE_RETRY_DELAY_MS,
      retries: MAX_RETRIES,
      factor: 2,
      maxRetryTime: 30_000,
    },
  });
}

export { createKafka };
