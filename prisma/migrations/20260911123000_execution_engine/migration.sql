-- AlterEnum
BEGIN;
CREATE TYPE "ExecutionStatus_new" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');
ALTER TABLE "public"."WorkflowExecution" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WorkflowExecution" ALTER COLUMN "status" TYPE "ExecutionStatus_new" USING ("status"::text::"ExecutionStatus_new");
ALTER TYPE "ExecutionStatus" RENAME TO "ExecutionStatus_old";
ALTER TYPE "ExecutionStatus_new" RENAME TO "ExecutionStatus";
DROP TYPE "public"."ExecutionStatus_old";
ALTER TABLE "WorkflowExecution" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NodeExecutionStatus_new" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
ALTER TABLE "public"."NodeExecution" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "NodeExecution" ALTER COLUMN "status" TYPE "NodeExecutionStatus_new" USING ("status"::text::"NodeExecutionStatus_new");
ALTER TYPE "NodeExecutionStatus" RENAME TO "NodeExecutionStatus_old";
ALTER TYPE "NodeExecutionStatus_new" RENAME TO "NodeExecutionStatus";
DROP TYPE "public"."NodeExecutionStatus_old";
ALTER TABLE "NodeExecution" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "WorkflowEdge" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "WorkflowExecution" ADD COLUMN "error" TEXT;
