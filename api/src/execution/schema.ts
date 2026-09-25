import { z } from "zod";

export const runWorkflowSchema = z.object({
  idempotencyKey: z.string().min(1).max(191).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});
