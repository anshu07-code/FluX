import type { PrismaClient } from "@prisma/client";
import { EXECUTION_TOPIC } from "./events.js";

export interface KafkaProducerLike {
  send(record: { topic: string; messages: Array<{ key?: string; value: string }> }): Promise<unknown>;
}

export interface PublishResult {
  publishedCount: number;
  failedCount: number;
}

export async function publishPendingOutboxEvents(
  db: PrismaClient,
  producer: KafkaProducerLike,
  batchSize: number = 10
): Promise<PublishResult> {
  // 1. Fetch pending outbox events (limit batchSize)
  // PostgreSQL SKIP LOCKED query or findMany with ordering
  const pendingEvents = await db.outboxEvent.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  let publishedCount = 0;
  let failedCount = 0;

  for (const event of pendingEvents) {
    try {
      // 2. Publish to Kafka
      const payloadString =
        typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);

      await producer.send({
        topic: EXECUTION_TOPIC,
        messages: [
          {
            key: event.aggregateId,
            value: payloadString,
          },
        ],
      });

      // 3. Mark processedAt ONLY after Kafka successfully acknowledges publication
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      publishedCount++;
    } catch (error) {
      // Log the failure but continue processing remaining events in this batch.
      // The failed event will be retried on the next poll since processedAt is not set.
      failedCount++;
      console.error(`Failed to publish outbox event ${event.id}:`, error);
    }
  }

  return { publishedCount, failedCount };
}
