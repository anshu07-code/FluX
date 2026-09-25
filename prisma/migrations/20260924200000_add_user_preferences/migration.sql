-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferences" JSONB;

-- AlterTable
ALTER TABLE "WorkflowExecution" ADD COLUMN     "failureNotifiedAt" TIMESTAMP(3);

