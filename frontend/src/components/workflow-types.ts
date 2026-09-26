import type { Edge, Node } from "@xyflow/react";
import {
  Zap, Globe, Brain, GitBranch, Mail, Database, Clock, FileText,
  Webhook, Code, Shuffle, Merge, AlertTriangle,
  Shield, SplitSquareHorizontal as Split, MessageSquare, Repeat, Timer,
  FileSearch, Filter, ThumbsUp, Fingerprint
} from "lucide-react";
import type { ComponentType } from "react";

export const workflowNodeTypes = [
  "trigger", "http", "ai", "condition", "email",
  "database", "code", "webhook", "delay", "set",
  "switch", "merge", "split", "error", "auth",
  "slack", "loop", "wait",
  "document", "filter", "approval", "idempotency"
] as const;
export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export type NodeOutput = { id: string; label: string };

export type NodeConfigField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "toggle" | "json";
  placeholder?: string;
  options?: { label: string; value: string }[] | string[];
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
};

export type NodeCatalogEntry = {
  label: string;
  description: string;
  accent: string;
  bg: string;
  icon: ComponentType<{ className?: string }>;
  category: "trigger" | "action" | "logic" | "utility";
  configFields: NodeConfigField[];
  outputs: NodeOutput[];
};

export const nodeCatalog: Record<WorkflowNodeType, NodeCatalogEntry> = {
  trigger: {
    label: "Trigger",
    description: "Starts the workflow",
    accent: "bg-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: Zap,
    category: "trigger",
    outputs: [{ id: "main", label: "Output" }],
    configFields: [
      {
        key: "triggerType",
        label: "Trigger Type",
        type: "select",
        required: true,
        description: "When should this workflow start?",
        options: [
          { label: "Manual", value: "manual" },
          { label: "Scheduled (Cron)", value: "cron" },
          { label: "Webhook", value: "webhook" },
        ],
      },
      {
        key: "cronExpression",
        label: "Cron Expression",
        type: "text",
        placeholder: "0 * * * *",
        description: "Run every hour. Uses standard 5-field cron syntax. Times are evaluated in UTC.",
      },
      {
        key: "webhookPath",
        label: "Webhook Path",
        type: "text",
        placeholder: "/my-webhook",
        description: "Custom path for this webhook: POST /webhooks/<path>. Leave empty to use the workflow ID as the path.",
      },
    ],
  },
  http: {
    label: "HTTP Request",
    description: "Call an external API",
    accent: "bg-sky-500",
    bg: "bg-sky-500/10 border-sky-500/20",
    icon: Globe,
    category: "action",
    outputs: [{ id: "main", label: "Response" }],
    configFields: [
      {
        key: "method",
        label: "Method",
        type: "select",
        required: true,
        description: "HTTP method. GET for reading data, POST/PUT for sending data, DELETE for removing resources.",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
          { label: "PATCH", value: "PATCH" },
          { label: "DELETE", value: "DELETE" },
        ],
      },
      {
        key: "url",
        label: "URL",
        type: "text",
        required: true,
        placeholder: "https://httpbin.org/get",
        description: "The endpoint URL. Supports expressions like {{trigger.body.id}}.",
      },
      {
        key: "headers",
        label: "Headers",
        type: "json",
        placeholder: '{"Authorization": "Bearer token"}',
        description: "HTTP request headers. Add one per row — common headers: Authorization, Content-Type, Accept.",
      },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        placeholder: '{"key": "value"}',
        description: "Request body sent as JSON. Only used with POST/PUT/PATCH methods.",
      },
      {
        key: "authType",
        label: "Authentication",
        type: "select",
        description: "How to authenticate with the API. Bearer uses a token in the Authorization header.",
        options: [
          { label: "None", value: "none" },
          { label: "Bearer Token", value: "bearer" },
          { label: "Basic Auth", value: "basic" },
          { label: "API Key", value: "apikey" },
        ],
      },
      {
        key: "authToken",
        label: "Token / API Key",
        type: "text",
        placeholder: "sk-... or {{trigger.token}}",
        description: "Used when Authentication is Bearer or API Key. Supports {{expressions}}.",
      },
      {
        key: "username",
        label: "Username",
        type: "text",
        placeholder: "api-user",
        description: "Used when Authentication is Basic Auth. Supports {{expressions}}.",
      },
      {
        key: "password",
        label: "Password",
        type: "text",
        placeholder: "••••••",
        description: "Used when Authentication is Basic Auth. Supports {{expressions}}.",
      },
      {
        key: "apiKeyHeader",
        label: "API Key Header",
        type: "text",
        placeholder: "X-API-Key",
        description: "Header name for API Key auth. Defaults to X-API-Key (also sent as Authorization: Bearer if left default).",
      },
      {
        key: "timeout",
        label: "Timeout (ms)",
        type: "number",
        placeholder: "5000",
        defaultValue: 5000,
        description: "Maximum time to wait for a response (capped at 20000ms). Request aborts after this timeout.",
      },
      {
        key: "followRedirects",
        label: "Follow Redirects",
        type: "toggle",
        defaultValue: true,
        description: "Automatically follow HTTP 3xx redirect responses.",
      },
    ],
  },
  ai: {
    label: "AI Model",
    description: "Transform with an AI model",
    accent: "bg-violet-500",
    bg: "bg-violet-500/10 border-violet-500/20",
    icon: Brain,
    category: "action",
    outputs: [{ id: "main", label: "Response" }, { id: "error", label: "Error" }],
    configFields: [
      {
        key: "provider",
        label: "Provider",
        type: "select",
        required: true,
        description: "AI service provider. All calls go through OpenRouter for unified access.",
        options: [
          { label: "OpenAI", value: "openai" },
          { label: "Anthropic", value: "anthropic" },
          { label: "Google Gemini", value: "gemini" },
        ],
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        required: true,
        description: "AI model to use. GPT-4o Mini is fast and cost-effective for most tasks.",
        options: [
          { label: "GPT-4o", value: "gpt-4o" },
          { label: "GPT-4o Mini", value: "gpt-4o-mini" },
          { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet" },
          { label: "Claude 3 Haiku", value: "claude-3-haiku" },
          { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        ],
      },
      {
        key: "apiKey",
        label: "API Key (Optional)",
        type: "text",
        placeholder: "sk-or-v1-...",
        description: "Your own OpenRouter API key. If empty, uses the platform's shared key. Get yours at openrouter.ai/keys.",
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        required: true,
        placeholder: "Summarize the following text:\n{{previous.output}}",
        description: "Use {{nodeId.output}} to reference outputs from other nodes.",
      },
      {
        key: "temperature",
        label: "Temperature",
        type: "number",
        placeholder: "0.7",
        defaultValue: 0.7,
        description: "Higher values = more creative, lower = more precise.",
      },
      {
        key: "maxTokens",
        label: "Max Tokens",
        type: "number",
        placeholder: "2048",
        defaultValue: 2048,
        description: "Maximum length of the AI response. Higher = longer output, more cost.",
      },
      {
        key: "systemPrompt",
        label: "System Prompt",
        type: "textarea",
        placeholder: "You are a helpful assistant...",
        description: "Optional system instructions for the model.",
      },
      {
        key: "jsonMode",
        label: "JSON Output",
        type: "toggle",
        defaultValue: false,
        description: "Force the model to respond in JSON format.",
      },
    ],
  },
  condition: {
    label: "Condition",
    description: "Route based on logic",
    accent: "bg-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: GitBranch,
    category: "logic",
    outputs: [{ id: "true", label: "True" }, { id: "false", label: "False" }],
    configFields: [
      {
        key: "leftValue",
        label: "Left Value",
        type: "text",
        required: true,
        placeholder: "{{previous.output.status}}",
        description: "The value to evaluate.",
      },
      {
        key: "operator",
        label: "Operator",
        type: "select",
        required: true,
        description: "Comparison operator. = means equals, contains checks if value includes the text.",
        options: [
          { label: "Equals", value: "eq" },
          { label: "Not Equals", value: "neq" },
          { label: "Greater Than", value: "gt" },
          { label: "Less Than", value: "lt" },
          { label: "Contains", value: "contains" },
          { label: "Starts With", value: "starts_with" },
          { label: "Regex Match", value: "regex" },
          { label: "Is Empty", value: "empty" },
        ],
      },
      {
        key: "rightValue",
        label: "Right Value",
        type: "text",
        placeholder: "200",
        description: "The value to compare against.",
      },
    ],
  },
  email: {
    label: "Send Email",
    description: "Send an email message",
    accent: "bg-rose-500",
    bg: "bg-rose-500/10 border-rose-500/20",
    icon: Mail,
    category: "action",
    outputs: [{ id: "main", label: "Sent" }],
    configFields: [
      {
        key: "to",
        label: "To",
        type: "text",
        required: true,
        placeholder: "user@example.com",
        description: "Recipient email. Supports {{expressions}}.",
      },
      {
        key: "subject",
        label: "Subject",
        type: "text",
        required: true,
        placeholder: "Workflow notification",
        description: "Email subject line. Supports {{expressions}} from previous nodes.",
      },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        required: true,
        placeholder: "Hello! Your workflow has completed.",
        description: "Email body content. Supports {{expressions}} for dynamic content.",
      },
      {
        key: "isHtml",
        label: "HTML Email",
        type: "toggle",
        defaultValue: false,
        description: "Enable to send formatted HTML emails instead of plain text.",
      },
    ],
  },
  database: {
    label: "Database",
    description: "Query a database",
    accent: "bg-teal-500",
    bg: "bg-teal-500/10 border-teal-500/20",
    icon: Database,
    category: "action",
    outputs: [{ id: "main", label: "Result" }],
    configFields: [
      {
        key: "operation",
        label: "Operation",
        type: "select",
        required: true,
        defaultValue: "findMany",
        description: "Database operation. findMany returns multiple rows, findOne returns a single record.",
        options: [
          { label: "Find Many", value: "findMany" },
          { label: "Find One", value: "findOne" },
          { label: "Create", value: "create" },
          { label: "Update", value: "update" },
          { label: "Delete", value: "delete" },
          { label: "Raw Query", value: "raw" },
        ],
      },
      {
        key: "table",
        label: "Table / Model",
        type: "text",
        required: true,
        defaultValue: "customers",
        placeholder: "customers",
        description: "Database table name. A Create node with Auto-Create Table builds missing tables automatically. Seeded demo tables: customers, tickets, orders.",
      },
      {
        key: "autoCreate",
        label: "Auto-Create Table",
        type: "toggle",
        defaultValue: true,
        description: "When on, a Create operation creates a missing table (and any missing columns) automatically on first run — including an owner_id column so rows stay private to this workflow's owner. When off, the table must already exist.",
      },
      {
        key: "where",
        label: "Filter Conditions",
        type: "json",
        placeholder: '{"status": "active"}',
        description: "Filter records by field/value equality. Used for findMany, findOne, update, and delete. Update/delete require at least one condition.",
      },
      {
        key: "data",
        label: "Data to Save",
        type: "json",
        placeholder: '{"name": "John"}',
        description: "Data for create/update operations. Supports {{expressions}}.",
      },
      {
        key: "sql",
        label: "SQL Statement (Raw Query only)",
        type: "textarea",
        placeholder: "SELECT * FROM customers WHERE tier = 'vip' LIMIT 10",
        description: "Used only when Operation is Raw Query. A single SELECT statement is allowed; other statements are rejected.",
      },
    ],
  },
  code: {
    label: "Code",
    description: "Run custom JavaScript",
    accent: "bg-cyan-500",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    icon: Code,
    category: "utility",
    outputs: [{ id: "main", label: "Output" }],
    configFields: [
      {
        key: "language",
        label: "Language",
        type: "select",
        required: true,
        description: "Programming language. Only JavaScript is supported in the sandbox.",
        options: [
          { label: "JavaScript", value: "javascript" },
          { label: "Python", value: "python" },
        ],
      },
      {
        key: "code",
        label: "Code",
        type: "textarea",
        required: true,
        placeholder: "return { result: input.data * 2 };",
        description: "Access previous node output via the 'input' variable.",
      },
    ],
  },
  webhook: {
    label: "Webhook",
    description: "Send a webhook call",
    accent: "bg-orange-500",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: Webhook,
    category: "action",
    outputs: [{ id: "main", label: "Response" }],
    configFields: [
      {
        key: "url",
        label: "URL",
        type: "text",
        required: true,
        placeholder: "https://hooks.slack.com/...",
        description: "Target URL. Must be HTTPS. Supports {{expressions}} for dynamic URLs.",
      },
      {
        key: "method",
        label: "Method",
        type: "select",
        description: "HTTP method. POST sends data, GET retrieves data.",
        options: [
          { label: "POST", value: "POST" },
          { label: "GET", value: "GET" },
        ],
      },
      {
        key: "payload",
        label: "Request Body",
        type: "json",
        placeholder: '{"text": "Hello from FluX!"}',
        description: "Data to send in the request body. Each row: a field name and its value. Supports {{expressions}}.",
      },
    ],
  },
  delay: {
    label: "Delay",
    description: "Wait before continuing",
    accent: "bg-slate-400",
    bg: "bg-slate-400/10 border-slate-400/20",
    icon: Clock,
    category: "utility",
    outputs: [{ id: "main", label: "Continue" }],
    configFields: [
      {
        key: "delayType",
        label: "Delay Type",
        type: "select",
        required: true,
        description: "Fixed pauses for a set time. Until waits for a specific date/time.",
        options: [
          { label: "Fixed Duration", value: "fixed" },
          { label: "Until Date", value: "until" },
        ],
      },
      {
        key: "duration",
        label: "Duration (seconds)",
        type: "number",
        placeholder: "60",
        defaultValue: 60,
        description: "How long to wait. Waits over 30 seconds pause the workflow durably and resume automatically.",
      },
      {
        key: "until",
        label: "Until Date (ISO date, Until type only)",
        type: "text",
        placeholder: "2026-01-01T09:00:00Z or {{trigger.resumeAt}}",
        description: "Target date/time to resume (ISO). Longer waits pause the workflow durably and resume automatically.",
      },
      {
        key: "unit",
        label: "Time Unit",
        type: "select",
        description: "Time unit for the duration value.",
        options: [
          { label: "Seconds", value: "seconds" },
          { label: "Minutes", value: "minutes" },
          { label: "Hours", value: "hours" },
          { label: "Days", value: "days" },
        ],
      },
    ],
  },
  set: {
    label: "Set Values",
    description: "Set workflow variables",
    accent: "bg-pink-500",
    bg: "bg-pink-500/10 border-pink-500/20",
    icon: FileText,
    category: "utility",
    outputs: [{ id: "main", label: "Output" }],
    configFields: [
      {
        key: "assignments",
        label: "Values to Set",
        type: "json",
        required: true,
        placeholder: '{"outputName": "{{input.value}}"}',
        description: "Define variables to set. Each row: a field name and its value. Use {{expressions}} to reference previous node outputs.",
      },
      {
        key: "keepOnlySet",
        label: "Keep Only Set Values",
        type: "toggle",
        defaultValue: false,
        description: "If true, only the assigned values are passed downstream.",
      },
    ],
  },
  switch: {
    label: "Switch",
    description: "Route to multiple branches",
    accent: "bg-indigo-500",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    icon: Shuffle,
    category: "logic",
    outputs: [{ id: "case1", label: "Case 1" }, { id: "case2", label: "Case 2" }, { id: "default", label: "Default" }],
    configFields: [
      {
        key: "value",
        label: "Value",
        type: "text",
        required: true,
        placeholder: "{{previous.output.status}}",
        description: "The value to evaluate against the rules. Supports {{expressions}}.",
      },
      {
        key: "rules",
        label: "Match Rules",
        type: "json",
        required: true,
        placeholder: '[{"value": "active", "output": 0}, {"value": "inactive", "output": 1}]',
        description: "Add rules that match input values to output branches. Each row: a value to match and which branch (Case 1, Case 2, Default) to send it to.",
      },
    ],
  },
  merge: {
    label: "Merge",
    description: "Combine multiple branches",
    accent: "bg-lime-500",
    bg: "bg-lime-500/10 border-lime-500/20",
    icon: Merge,
    category: "logic",
    outputs: [{ id: "main", label: "Merged" }],
    configFields: [
      {
        key: "mode",
        label: "Merge Mode",
        type: "select",
        required: true,
        description: "How to combine data from multiple incoming branches.",
        options: [
          { label: "Append", value: "append" },
          { label: "Merge by Key", value: "mergeByKey" },
          { label: "Combine", value: "combine" },
        ],
      },
    ],
  },
  split: {
    label: "Split In Batches",
    description: "Process items in parallel",
    accent: "bg-fuchsia-500",
    bg: "bg-fuchsia-500/10 border-fuchsia-500/20",
    icon: Split,
    category: "utility",
    outputs: [{ id: "main", label: "Batch" }],
    configFields: [
      {
        key: "batchSize",
        label: "Batch Size",
        type: "number",
        placeholder: "10",
        defaultValue: 10,
        description: "Number of items to process in each batch.",
      },
    ],
  },
  error: {
    label: "Error Handler",
    description: "Handle errors gracefully",
    accent: "bg-red-500",
    bg: "bg-red-500/10 border-red-500/20",
    icon: AlertTriangle,
    category: "utility",
    outputs: [{ id: "main", label: "Continue" }, { id: "error", label: "Error" }],
    configFields: [
      {
        key: "action",
        label: "On Error",
        type: "select",
        required: true,
        description: "What to do when an upstream node fails. Continue ignores the error, Retry attempts again.",
        options: [
          { label: "Continue", value: "continue" },
          { label: "Retry (3x)", value: "retry" },
          { label: "Stop Workflow", value: "stop" },
          { label: "Fallback Output", value: "fallback" },
        ],
      },
    ],
  },
  auth: {
    label: "Auth Gate",
    description: "Validate credentials",
    accent: "bg-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    icon: Shield,
    category: "utility",
    outputs: [{ id: "main", label: "Authenticated" }, { id: "denied", label: "Denied" }],
    configFields: [
      {
        key: "authType",
        label: "Auth Type",
        type: "select",
        required: true,
        description: "Authentication method to validate. API Key compares hash, JWT checks structure.",
        options: [
          { label: "API Key", value: "apikey" },
          { label: "JWT", value: "jwt" },
          { label: "OAuth 2.0", value: "oauth" },
        ],
      },
      {
        key: "tokenSource",
        label: "Token Source",
        type: "text",
        placeholder: "{{trigger.headers.authorization}}",
        description: "Dot-path to extract the token from (e.g. 'headers.x-api-key').",
      },
      {
        key: "secret",
        label: "Secret / Key",
        type: "text",
        placeholder: "your-secret-key",
        description: "The expected API key or secret. If empty, the gate denies every request (fail closed).",
      },
    ],
  },
  slack: {
    label: "Slack Message",
    description: "Send messages to Slack channels via webhook",
    icon: MessageSquare,
    accent: "#a855f7",
    bg: "bg-purple-500/10 border-purple-500/20",
    category: "action" as const,
    outputs: [{ id: "main", label: "Sent" }, { id: "error", label: "Error" }],
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", type: "text" as const, placeholder: "https://hooks.slack.com/services/...", required: true, description: "Incoming webhook URL from Slack app settings. Create at api.slack.com/apps → Incoming Webhooks." },
      { key: "channel", label: "Channel", type: "text" as const, placeholder: "#general", description: "Slack channel to post to (e.g. #general, #alerts). Must match the channel selected when creating the webhook." },
      { key: "message", label: "Message", type: "textarea" as const, placeholder: "Hello from FluX! {{result}}", required: true, description: "Message text. Supports {{expressions}} like {{output.record.name}} to reference data from previous nodes." },
      { key: "username", label: "Bot Name", type: "text" as const, placeholder: "FluX Bot", defaultValue: "FluX Bot", description: "Display name of the bot posting the message." },
      { key: "iconEmoji", label: "Icon Emoji", type: "text" as const, placeholder: ":zap:", defaultValue: ":zap:", description: "Emoji icon for the bot message (e.g. :robot_face:, :bell:)." },
    ],
  },
  loop: {
    label: "Loop",
    description: "Iterates each item in an array, runs a per-item expression, and passes the results downstream",
    icon: Repeat,
    accent: "#06b6d4",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    category: "utility" as const,
    outputs: [{ id: "done", label: "Results" }],
    configFields: [
      { key: "inputPath", label: "Array Field Path", type: "text" as const, placeholder: "data.items", defaultValue: "items", description: "Dot-path to the array in the input (e.g. 'output.records' for database results)." },
      { key: "itemCode", label: "Per-Item Code", type: "textarea" as const, placeholder: "return { ...item, ok: true };", description: "JavaScript run once per item. Use `item` and `index`. Leave empty to pass items through unchanged." },
      { key: "batchSize", label: "Batch Size", type: "number" as const, defaultValue: 10, description: "Number of items grouped per batch in the output." },
    ],
  },
  wait: {
    label: "Wait / Delay",
    description: "Pause workflow execution for a specified duration",
    icon: Timer,
    accent: "#94a3b8",
    bg: "bg-slate-400/10 border-slate-400/20",
    category: "utility" as const,
    outputs: [{ id: "main", label: "Continue" }],
    configFields: [
      { key: "waitType", label: "Wait Type", type: "select" as const, options: ["delay", "until"], defaultValue: "delay", description: "Delay pauses for a duration. Until waits for a specific date." },
      { key: "duration", label: "Duration", type: "number" as const, defaultValue: 5, description: "Time to wait. Waits over 30 seconds pause the workflow durably and resume automatically." },
      { key: "until", label: "Until Date (Until type only)", type: "text" as const, placeholder: "2026-01-01T09:00:00Z", description: "Target date/time to resume (ISO). Longer waits pause the workflow durably and resume automatically." },
      { key: "unit", label: "Unit", type: "select" as const, options: ["seconds", "minutes", "hours", "days"], defaultValue: "seconds", description: "Time unit for the duration." },
    ],
  },
  document: {
    label: "Document Parser",
    description: "Extract text/data from documents",
    icon: FileSearch,
    accent: "#f97316",
    bg: "bg-orange-500/10 border-orange-500/20",
    category: "action" as const,
    outputs: [{ id: "main", label: "Parsed" }, { id: "error", label: "Error" }],
    configFields: [
      { key: "source", label: "Source", type: "select" as const, required: true, options: ["upload", "url", "base64"], description: "Where the document comes from." },
      { key: "parseMode", label: "Parse Mode", type: "select" as const, required: true, options: ["text", "ocr", "table", "json"], defaultValue: "text", description: "How to extract content. OCR for images, table for tabular data." },
      { key: "outputFormat", label: "Output Format", type: "select" as const, options: ["text", "json"], defaultValue: "text", description: "Output as plain text or structured JSON." },
      { key: "documentUrl", label: "Document URL / Path", type: "text" as const, placeholder: "{{trigger.fileUrl}}", description: "URL or path to the document to parse." },
    ],
  },
  filter: {
    label: "Filter",
    description: "Filter arrays by condition",
    icon: Filter,
    accent: "#8b5cf6",
    bg: "bg-violet-500/10 border-violet-500/20",
    category: "logic" as const,
    outputs: [{ id: "matching", label: "Matching" }, { id: "rest", label: "Rest" }],
    configFields: [
      { key: "inputPath", label: "Input Array Field", type: "text" as const, required: true, placeholder: "data.items", description: "Dot-path to the array to filter (e.g. 'output.records')." },
      { key: "condition", label: "Filter Condition", type: "text" as const, required: true, placeholder: "status === 'active'", description: "Expression per item. Use field names directly: status === 'active', value > 100." },
      { key: "keepMatching", label: "Keep Matching", type: "toggle" as const, defaultValue: true, description: "If true, matching items go to 'Matching' output. If false, they go to 'Rest'." },
    ],
  },
  approval: {
    label: "Human Approval",
    description: "Wait for human sign-off",
    icon: ThumbsUp,
    accent: "#10b981",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    category: "logic" as const,
    outputs: [{ id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }, { id: "timeout", label: "Timeout" }],
    configFields: [
      { key: "approverSource", label: "Approver Source", type: "select" as const, required: true, options: ["email", "slack", "role"], description: "How to reach the approver for sign-off." },
      { key: "approverEmail", label: "Approver Email / Channel", type: "text" as const, placeholder: "manager@company.com", description: "Email address or Slack channel for the approver." },
      { key: "title", label: "Approval Title", type: "text" as const, placeholder: "Invoice needs review", description: "Short title shown in the approval request." },
      { key: "description", label: "Description", type: "textarea" as const, placeholder: "Amount: $500. Review and approve/reject.", description: "Detailed description of what needs approval." },
      { key: "autoApprove", label: "Auto Approve", type: "toggle" as const, defaultValue: true, description: "Approve immediately without human review (default, since no approval inbox is connected yet). When off, the node fails with an error until a real approval inbox is connected." },
      { key: "timeoutDuration", label: "Timeout (ms)", type: "number" as const, defaultValue: 86400000, description: "Default 24 hours. If no response, triggers timeout branch." },
      { key: "escalateTo", label: "Escalate To", type: "text" as const, placeholder: "vp@company.com", description: "If timeout, escalate to this person." },
    ],
  },
  idempotency: {
    label: "Idempotency Guard",
    description: "Prevent duplicate processing",
    icon: Fingerprint,
    accent: "#06b6d4",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    category: "utility" as const,
    outputs: [{ id: "main", label: "Proceed" }, { id: "duplicate", label: "Duplicate" }],
    configFields: [
      { key: "keyExpression", label: "Deduplication Key", type: "text" as const, required: true, placeholder: "{{trigger.eventId}}", description: "Unique key to identify this event. If seen before within TTL, routes to 'Duplicate' branch." },
      { key: "ttl", label: "TTL (seconds)", type: "number" as const, defaultValue: 3600, description: "How long to remember this key. After expiry, the same key is allowed again." },
      { key: "store", label: "Store", type: "select" as const, options: ["database", "memory"], defaultValue: "database", description: "Database store is durable: it survives restarts and dedupes correctly across multiple workers." },
    ],
  },
};

export const nodeCategories = [
  { id: "trigger", label: "Triggers", types: workflowNodeTypes.filter((t) => nodeCatalog[t].category === "trigger") },
  { id: "action", label: "Actions", types: workflowNodeTypes.filter((t) => nodeCatalog[t].category === "action") },
  { id: "logic", label: "Logic", types: workflowNodeTypes.filter((t) => nodeCatalog[t].category === "logic") },
  { id: "utility", label: "Utility", types: workflowNodeTypes.filter((t) => nodeCatalog[t].category === "utility") },
] as const;

export type WorkflowNodeData = {
  label: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
  [key: string]: unknown;
};

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;
