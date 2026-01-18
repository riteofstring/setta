import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PERMISSION_MODE_VALUES = new Set([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
]);

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function parseJsonLine(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to parse input JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return null;
  }
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizePolicy(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function resolveDecisionPolicy(rawPolicy) {
  if (!rawPolicy) {
    return "ask";
  }
  const normalized = rawPolicy.toLowerCase();
  if (
    normalized.includes("allow") ||
    normalized.includes("auto") ||
    normalized.includes("bypass")
  ) {
    return "allow";
  }
  if (normalized.includes("deny") || normalized.includes("block")) {
    return "deny";
  }
  return "ask";
}

function buildSandboxOptions(rawPolicy) {
  const policy = normalizePolicy(rawPolicy);
  if (!policy) {
    return {};
  }
  if (policy.startsWith("{") || policy.startsWith("[")) {
    const parsed = tryParseJson(policy);
    if (parsed && typeof parsed === "object") {
      return { sandbox: parsed };
    }
  }
  const normalized = policy.toLowerCase();
  if (
    normalized === "disabled" ||
    normalized === "off" ||
    normalized === "false" ||
    normalized === "0" ||
    normalized === "dangerously_disable" ||
    normalized === "dangerously-disable"
  ) {
    return { dangerouslyDisableSandbox: true };
  }
  if (
    normalized === "allow_unsandboxed_commands" ||
    normalized === "allow-unsandboxed-commands" ||
    normalized === "allow_unsandboxed"
  ) {
    return { sandbox: { enabled: true, allowUnsandboxedCommands: true } };
  }
  if (
    normalized === "enabled" ||
    normalized === "on" ||
    normalized === "true" ||
    normalized === "sandboxed"
  ) {
    return { sandbox: { enabled: true } };
  }
  return {};
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let resolveStartPayload;
const startPayloadPromise = new Promise((resolve) => {
  resolveStartPayload = resolve;
});

const pendingApprovals = new Map();

function resolveApproval(payload) {
  const approvalId =
    typeof payload.approvalId === "string"
      ? payload.approvalId
      : typeof payload.approval_id === "string"
        ? payload.approval_id
        : null;
  if (!approvalId) {
    return;
  }
  let approved = null;
  if (typeof payload.approved === "boolean") {
    approved = payload.approved;
  }
  if (typeof payload.decision === "string") {
    const normalized = payload.decision.toLowerCase();
    if (["allow", "approve", "approved", "yes", "y", "true"].includes(normalized)) {
      approved = true;
    } else if (
      ["deny", "denied", "no", "n", "false"].includes(normalized)
    ) {
      approved = false;
    }
  }
  if (approved === null) {
    approved = false;
  }
  const resolver = pendingApprovals.get(approvalId);
  if (resolver) {
    resolver(Boolean(approved));
    pendingApprovals.delete(approvalId);
  }
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  const payload = parseJsonLine(trimmed);
  if (!payload || typeof payload !== "object") {
    return;
  }
  if (payload.type === "approval_response") {
    resolveApproval(payload);
    return;
  }
  if (payload.type === "start" || (payload.prompt && !payload.type)) {
    resolveStartPayload(payload);
  }
});

process.on("unhandledRejection", (err) => {
  writeEvent({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

const input = await startPayloadPromise;
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const options = {};
const systemPrompt =
  typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : "";
if (systemPrompt) {
  options.systemPrompt = systemPrompt;
}
if (typeof input.mcpConfig === "string" && input.mcpConfig.trim()) {
  options.mcpConfig = input.mcpConfig;
}
if (Array.isArray(input.allowedTools) && input.allowedTools.length > 0) {
  options.allowedTools = input.allowedTools;
}
const model = normalizePolicy(input.defaultModel) ?? normalizePolicy(input.model);
if (model) {
  options.model = model;
}

const approvalPolicy = normalizePolicy(input.approvalPolicy);
if (approvalPolicy && PERMISSION_MODE_VALUES.has(approvalPolicy)) {
  options.permissionMode = approvalPolicy;
} else if (approvalPolicy) {
  options.permissionMode = approvalPolicy;
}

Object.assign(options, buildSandboxOptions(input.sandboxPolicy));

const decisionPolicy = resolveDecisionPolicy(approvalPolicy);
options.canUseTool = async (tool, toolInput) => {
  if (decisionPolicy === "allow") {
    return { behavior: "allow", updatedInput: toolInput };
  }
  if (decisionPolicy === "deny") {
    return {
      behavior: "deny",
      message: "Denied by approval policy.",
    };
  }
  const approvalId = randomUUID();
  writeEvent({
    type: "approval_request",
    approvalId,
    runId: input.runId,
    tool,
    input: toolInput,
    toolName: tool?.name,
    toolType: tool?.type,
  });
  const approved = await new Promise((resolve) => {
    pendingApprovals.set(approvalId, resolve);
  });
  if (approved) {
    return { behavior: "allow", updatedInput: toolInput };
  }
  return {
    behavior: "deny",
    message: "User denied permission for this tool.",
  };
};

options.includePartialMessages = true;

const request = { prompt, options };
if (!request.prompt) {
  writeEvent({ type: "error", message: "Missing prompt input" });
  process.exit(1);
}

for await (const message of query(request)) {
  writeEvent(message);
}
