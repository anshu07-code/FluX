/**
 * Default node configs seeded when instantiating templates so that
 * workflows execute successfully without requiring manual configuration.
 */
export function defaultNodeConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return {
        triggerType: "webhook",
        // Empty path → the webhook URL uses the workflow ID as its path.
        webhookPath: "",
      };

    case "http":
      return {
        method: "GET",
        // Real, publicly reachable endpoint so templates execute successfully
        // out of the box (api.example.com does not resolve) — replace it with
        // your own API endpoint.
        url: "https://httpbin.org/get",
        timeout: 5000,
        authType: "none",
        followRedirects: true,
      };

    case "webhook":
      return {
        method: "POST",
      };

    case "ai":
      return {
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Analyze the input data and provide a concise summary.",
        temperature: 0.7,
        maxTokens: 512,
      };

    case "condition":
      return {
        leftValue: "value",
        operator: "gt",
        rightValue: 5,
      };

    case "switch":
      return {
        value: "value",
        rules: [
          { value: "active", output: 0 },
          { value: "inactive", output: 1 },
        ],
      };

    case "filter":
      return {
        inputPath: "items",
        condition: "status === 'active'",
        keepMatching: true,
      };

    case "code":
      return {
        language: "javascript",
        code: "return { processed: true, value: input?.value ?? 0 };",
      };

    case "set":
      return {
        assignments: { processed: true, timestamp: "{{now}}" },
        keepOnlySet: false,
      };

    case "email":
      return {
        to: "user@example.com",
        subject: "Workflow notification",
        body: "Your workflow has completed successfully.",
        isHtml: false,
      };

    case "slack":
      return {
        channel: "#general",
        message: "✅ Workflow completed successfully!",
        username: "FluX Bot",
      };

    case "database":
      return {
        operation: "findMany",
        // "customers" is a real seeded Postgres table (see scripts/seed-real-db).
        table: "customers",
      };

    case "error":
      return {
        action: "continue",
        retries: 0,
      };

    case "auth":
      return {
        authType: "apikey",
        tokenSource: "token",
        secret: "",
      };

    case "document":
      return {
        parseMode: "text",
        outputFormat: "text",
      };

    case "merge":
      return {
        mode: "append",
      };

    case "split":
      return {
        batchSize: 10,
      };

    case "loop":
      return {
        inputPath: "items",
        batchSize: 10,
      };

    case "wait":
      return {
        waitType: "delay",
        duration: 5,
        unit: "seconds",
      };

    case "delay":
      return {
        delayType: "fixed",
        duration: 60,
        unit: "seconds",
      };

    case "approval":
      return {
        title: "Approve action",
        // Auto-approve by default so workflows run end-to-end (no human approval
        // inbox is wired up yet). Set autoApprove:false to make the node fail
        // loudly until a real reviewer flow is connected.
        autoApprove: true,
        approverSource: "email",
      };

    case "idempotency":
      return {
        keyExpression: "{{eventId}}",
        ttl: 3600,
      };

    default:
      return {};
  }
}
