import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PERMISSION_MODE_VALUES = new Set([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "delegate",
  "dontAsk",
  "plan",
]);
const PERMISSION_MODE_ALIASES = new Map([
  ["allow", "dontAsk"],
  ["auto", "dontAsk"],
  ["bypass", "bypassPermissions"],
  ["ask", "default"],
  ["deny", "default"],
  ["block", "default"],
]);
const DEFAULT_THINKING_BUDGET = 1024;

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function summarizeContentTypes(content) {
  if (!Array.isArray(content)) {
    return null;
  }
  const types = [];
  for (const entry of content) {
    if (entry && typeof entry === "object" && typeof entry.type === "string") {
      types.push(entry.type);
    }
  }
  return types.length ? types : null;
}

function logMessageSummary(message) {
  if (!message || typeof message !== "object") {
    console.error("[claude-sdk-runner] message: null");
    return;
  }
  const summary = {
    type: typeof message.type === "string" ? message.type : null,
  };
  const streamEvent =
    (message.event && typeof message.event === "object" && message.event) ||
    (message.stream_event &&
      typeof message.stream_event === "object" &&
      message.stream_event) ||
    null;
  if (streamEvent) {
    summary.eventType =
      typeof streamEvent.type === "string" ? streamEvent.type : null;
    const block = streamEvent.content_block;
    if (block && typeof block === "object") {
      summary.contentBlockType =
        typeof block.type === "string" ? block.type : null;
    }
    const delta = streamEvent.delta;
    if (delta && typeof delta === "object") {
      summary.deltaType = typeof delta.type === "string" ? delta.type : null;
    }
  }
  const messagePayload =
    message.message && typeof message.message === "object" ? message.message : null;
  const contentTypes = summarizeContentTypes(
    (messagePayload && messagePayload.content) || message.content,
  );
  if (contentTypes) {
    summary.contentTypes = contentTypes;
  }
  console.error("[claude-sdk-runner] message", JSON.stringify(summary));
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

function normalizeThinkingBudget(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return null;
}

function resolvePermissionMode(value) {
  const normalized = normalizePolicy(value);
  if (!normalized) {
    return null;
  }
  if (PERMISSION_MODE_VALUES.has(normalized)) {
    return normalized;
  }
  const alias = PERMISSION_MODE_ALIASES.get(normalized.toLowerCase());
  return alias ?? null;
}

function resolveThinkingConfig(input) {
  if (!input || typeof input !== "object") {
    return { type: "enabled", budget_tokens: DEFAULT_THINKING_BUDGET };
  }
  if (input.thinking === false || input.thinking === "disabled") {
    return null;
  }
  if (input.thinking && typeof input.thinking === "object") {
    return input.thinking;
  }
  const budget = normalizeThinkingBudget(
    input.thinkingBudgetTokens ?? input.thinking_budget_tokens,
  );
  const resolvedBudget = budget ?? DEFAULT_THINKING_BUDGET;
  return { type: "enabled", budget_tokens: resolvedBudget };
}

function normalizeMaxTurns(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return null;
}

function resolveCloseAfterResponse(input, maxTurns) {
  if (!input || typeof input !== "object") {
    return true;
  }
  if (typeof input.closeAfterResponse === "boolean") {
    return input.closeAfterResponse;
  }
  if (typeof input.close_after_response === "boolean") {
    return input.close_after_response;
  }
  if (typeof input.singleTurn === "boolean") {
    return input.singleTurn;
  }
  if (maxTurns === 1) {
    return true;
  }
  return true;
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

function extractToolName(tool) {
  if (typeof tool === "string") {
    return tool;
  }
  if (tool && typeof tool === "object" && typeof tool.name === "string") {
    return tool.name;
  }
  return null;
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
        : typeof payload.toolCallId === "string"
          ? payload.toolCallId
          : typeof payload.tool_call_id === "string"
            ? payload.tool_call_id
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
  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    return;
  }
  let updatedInput = null;
  if (payload && typeof payload.updatedInput === "object") {
    updatedInput = payload.updatedInput;
  }
  const payloadWrapper =
    payload && typeof payload.payload === "object" ? payload.payload : null;
  const answers =
    payloadWrapper && typeof payloadWrapper.answers === "object"
      ? payloadWrapper.answers
      : payload && typeof payload.answers === "object"
        ? payload.answers
        : null;
  if (!updatedInput && answers && pending.toolName === "AskUserQuestion") {
    const baseInput =
      pending.toolInput && typeof pending.toolInput === "object"
        ? pending.toolInput
        : {};
    updatedInput = { ...baseInput, answers };
  }
  if (approved === null) {
    approved = Boolean(updatedInput);
  }
  pending.resolve({ approved: Boolean(approved), updatedInput });
  pendingApprovals.delete(approvalId);
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
  if (payload.type === "approval_response" || payload.type === "tool_response") {
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
let systemPrompt = null;
if (typeof input.systemPrompt === "string") {
  const trimmed = input.systemPrompt.trim();
  if (trimmed) {
    systemPrompt = trimmed;
  }
} else if (input.systemPrompt && typeof input.systemPrompt === "object") {
  systemPrompt = input.systemPrompt;
}
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

const maxTurns = normalizeMaxTurns(input.maxTurns ?? input.max_turns);
if (maxTurns !== null) {
  options.maxTurns = maxTurns;
}

const thinkingConfig = resolveThinkingConfig(input);
if (thinkingConfig) {
  options.thinking = thinkingConfig;
}

const resume =
  normalizePolicy(input.resume) ??
  normalizePolicy(input.sessionId) ??
  normalizePolicy(input.session_id);
if (resume) {
  options.resume = resume;
}

const approvalPolicy = normalizePolicy(input.approvalPolicy);
const permissionMode = resolvePermissionMode(approvalPolicy);
if (permissionMode) {
  options.permissionMode = permissionMode;
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
  const toolName = extractToolName(tool);
  writeEvent({
    type: "approval_request",
    approvalId,
    runId: input.runId,
    tool,
    input: toolInput,
    toolName,
    toolType: tool?.type,
  });
  const response = await new Promise((resolve) => {
    pendingApprovals.set(approvalId, {
      resolve,
      toolInput,
      toolName,
    });
  });
  const approved = Boolean(response?.approved);
  if (approved) {
    return {
      behavior: "allow",
      updatedInput: response?.updatedInput ?? toolInput,
    };
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

const closeAfterResponse = resolveCloseAfterResponse(input, maxTurns);

const promptPreview =
  prompt.length > 200 ? `${prompt.slice(0, 200)}...` : prompt;
console.error(
  "[claude-sdk-runner] start",
  JSON.stringify({
    model: options.model ?? null,
    thinking: options.thinking ?? null,
    maxTurns: options.maxTurns ?? null,
    allowedTools: options.allowedTools ?? null,
    permissionMode: options.permissionMode ?? null,
    systemPrompt:
      typeof options.systemPrompt === "string"
        ? "string"
        : options.systemPrompt
          ? "object"
          : null,
    resume: options.resume ?? null,
    promptPreview,
  }),
);

const TERMINAL_MESSAGE_TYPES = new Set([
  "result",
  "final",
  "message_stop",
  "complete",
  "done",
]);

function isTerminalMessage(message, sawToolUse, sawToolResult) {
  if (!message || typeof message !== "object") {
    return false;
  }
  if (typeof message.type === "string" && TERMINAL_MESSAGE_TYPES.has(message.type)) {
    if (message.type === "message_stop") {
      return !sawToolUse || sawToolResult;
    }
    return true;
  }
  const streamEvent =
    (message.event && typeof message.event === "object" && message.event) ||
    (message.stream_event &&
      typeof message.stream_event === "object" &&
      message.stream_event) ||
    null;
  if (
    streamEvent &&
    typeof streamEvent.type === "string" &&
    TERMINAL_MESSAGE_TYPES.has(streamEvent.type)
  ) {
    if (streamEvent.type === "message_stop") {
      return !sawToolUse || sawToolResult;
    }
    return true;
  }
  return false;
}

function updateToolFlags(message, state) {
  if (!message || typeof message !== "object") {
    return;
  }
  const streamEvent =
    (message.event && typeof message.event === "object" && message.event) ||
    (message.stream_event &&
      typeof message.stream_event === "object" &&
      message.stream_event) ||
    null;
  if (streamEvent && streamEvent.type === "content_block_start") {
    const block = streamEvent.content_block;
    if (block && typeof block === "object") {
      if (block.type === "tool_use") {
        state.sawToolUse = true;
      } else if (block.type === "tool_result") {
        state.sawToolResult = true;
      }
    }
    return;
  }
  if (message.type === "assistant") {
    const content = message.message?.content;
    if (Array.isArray(content)) {
      for (const entry of content) {
        if (entry && typeof entry === "object" && entry.type === "tool_use") {
          state.sawToolUse = true;
        }
      }
    }
  }
}

const toolState = { sawToolUse: false, sawToolResult: false };
for await (const message of query(request)) {
  writeEvent(message);
  logMessageSummary(message);
  updateToolFlags(message, toolState);
  if (closeAfterResponse && isTerminalMessage(message, toolState.sawToolUse, toolState.sawToolResult)) {
    process.exit(0);
  }
}
