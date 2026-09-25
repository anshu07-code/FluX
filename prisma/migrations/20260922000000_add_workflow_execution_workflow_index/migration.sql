-- CreateIndex: adds an index for per-workflow execution history lookups
CREATE INDEX "WorkflowExecution_workflowId_createdAt_idx" ON "WorkflowExecution"("workflowId", "createdAt");
