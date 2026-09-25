-- Durable waits: nodes that pause longer than the in-process limit are marked
-- WAITING (with a resume timestamp in their output) and resumed by the scheduler.
ALTER TYPE "NodeExecutionStatus" ADD VALUE IF NOT EXISTS 'WAITING';
