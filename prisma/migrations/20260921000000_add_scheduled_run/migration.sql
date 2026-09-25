-- Add lastScheduledRunAt to Workflow for cron scheduling
ALTER TABLE "Workflow" ADD COLUMN "lastScheduledRunAt" TIMESTAMP(3) NULL;