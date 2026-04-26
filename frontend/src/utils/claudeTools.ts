import { normalizeGeneratedToolName } from "@setta/app-subsystem-frontend-sdk";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  ToolCall,
  ToolNameNormalizationConfig,
} from "utils/generatedTypes";

type AskUserQuestionOption = {
  label: string;
  description?: string;
};

export type AskUserQuestionPrompt = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: AskUserQuestionOption[];
};

export type AskUserQuestionPayload = {
  questions: AskUserQuestionPrompt[];
  answers?: Record<string, string>;
};

type ApprovalPayload = {
  approvalId?: string;
  toolName?: string;
  toolType?: string;
  tool?: unknown;
  input?: unknown;
};

type ToolInteractionIndex = {
  lastAssistantIndex: number;
  toolResultIndexById: Map<string, number>;
};

export function normalizeToolName(
  name: string | null | undefined,
): string | null {
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  let normalized = trimmed;
  const {
    mcpPrefix,
    singlePrefix,
    doublePrefix,
    askUserQuestionToolAlias,
    askUserQuestionToolName,
  } = ToolNameNormalizationConfig;
  const loweredAlias = askUserQuestionToolAlias.toLowerCase();
  if (normalized.startsWith(mcpPrefix)) {
    normalized = normalized.slice(mcpPrefix.length);
  }
  if (
    trimmed.startsWith(mcpPrefix) &&
    normalized.toLowerCase() === loweredAlias
  ) {
    return normalized;
  }
  if (
    !trimmed.startsWith(mcpPrefix) &&
    normalized.toLowerCase() === loweredAlias
  ) {
    return askUserQuestionToolName;
  }
  return normalizeGeneratedToolName(
    normalized,
    singlePrefix,
    doublePrefix,
    askUserQuestionToolName,
  );
}

export function resolveToolCallArguments(
  toolCall: ToolCall,
  toolCallArguments?: Record<string, string>,
): unknown | null {
  const rawArgs = toolCall.function?.arguments;
  if (isRecord(rawArgs) && Object.keys(rawArgs).length > 0) {
    return rawArgs;
  }
  const pendingArgs = toolCallArguments?.[toolCall.id];
  if (typeof pendingArgs !== "string" || !pendingArgs.trim()) {
    return null;
  }
  const parsed = parseToolCallArguments(pendingArgs);
  if (parsed === null) {
    return null;
  }
  return parsed;
}

export function parseAskUserQuestionPayload(
  value: unknown,
): AskUserQuestionPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const questionEntries = resolveAskUserQuestionEntries(value);
  if (!questionEntries) {
    return null;
  }
  const questions = questionEntries
    .map(parseAskUserQuestionPrompt)
    .filter(isPresent);
  const answers = parseAnswers(value.answers);
  return {
    questions,
    ...(answers ? { answers } : {}),
  };
}

export function parseApprovalPayload(value: unknown): ApprovalPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const approvalId = readOptionalString(value.approvalId);
  const toolName = extractToolName(value);
  const toolType = readOptionalString(value.toolType);
  const input = "input" in value ? value.input : undefined;
  const tool = "tool" in value ? value.tool : undefined;
  const payload: ApprovalPayload = {};
  if (approvalId) {
    payload.approvalId = approvalId;
  }
  if (toolName) {
    payload.toolName = toolName;
  }
  if (toolType) {
    payload.toolType = toolType;
  }
  if (tool !== undefined) {
    payload.tool = tool;
  }
  if (input !== undefined) {
    payload.input = input;
  }
  return payload;
}

export function parseAnswers(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const nestedAnswers = isRecord(value.answers) ? value.answers : value;
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(nestedAnswers)) {
    if (typeof entry === "string") {
      output[key] = entry;
    }
  }
  return Object.keys(output).length > 0 ? output : null;
}

export function hasPendingToolInteraction(
  messages: Array<BaseChatMessageUnion>,
): boolean {
  if (messages.length === 0) {
    return false;
  }
  const toolInteractionIndex = buildToolInteractionIndex(messages);
  for (const message of messages) {
    if (message.role !== ChatRoleEnum.assistant) {
      continue;
    }
    for (const toolCall of message.tool_calls ?? []) {
      if (isPendingToolInteraction(toolCall, toolInteractionIndex)) {
        return true;
      }
    }
  }

  return false;
}

function resolveAskUserQuestionEntries(
  value: Record<string, unknown>,
): Array<unknown> | null {
  if (Array.isArray(value.questions)) {
    return value.questions;
  }
  return readOptionalString(value.question) ? [value] : null;
}

function parseAskUserQuestionPrompt(
  entry: unknown,
): AskUserQuestionPrompt | null {
  if (!isRecord(entry)) {
    return null;
  }
  const question = readOptionalString(entry.question);
  if (!question) {
    return null;
  }
  return {
    header: readOptionalString(entry.header) ?? "",
    question,
    multiSelect: readBooleanWithFallback(entry.multiSelect, entry.multiple),
    options: parseAskUserQuestionOptions(entry.options),
  };
}

function parseAskUserQuestionOptions(
  value: unknown,
): Array<AskUserQuestionOption> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(parseAskUserQuestionOption).filter(isPresent);
}

function parseAskUserQuestionOption(
  entry: unknown,
): AskUserQuestionOption | null {
  if (typeof entry === "string") {
    const label = entry.trim();
    return label ? { label } : null;
  }
  if (!isRecord(entry)) {
    return null;
  }
  const label =
    readOptionalString(entry.label) ?? readOptionalString(entry.value);
  if (!label) {
    return null;
  }
  const description = readOptionalString(entry.description);
  return description ? { label, description } : { label };
}

function buildToolInteractionIndex(
  messages: Array<BaseChatMessageUnion>,
): ToolInteractionIndex {
  const toolResultIndexById = new Map<string, number>();
  let lastAssistantIndex = -1;
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === ChatRoleEnum.assistant) {
      lastAssistantIndex = i;
    }
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      toolResultIndexById.set(message.tool_call_id, i);
    }
  }
  return { lastAssistantIndex, toolResultIndexById };
}

function isPendingToolInteraction(
  toolCall: ToolCall,
  toolInteractionIndex: ToolInteractionIndex,
): boolean {
  if (!isToolInteractionName(normalizeToolName(toolCall.function?.name))) {
    return false;
  }
  const toolResultIndex = toolInteractionIndex.toolResultIndexById.get(
    toolCall.id,
  );
  if (toolResultIndex === undefined) {
    return true;
  }
  return toolResultIndex > toolInteractionIndex.lastAssistantIndex;
}

function isToolInteractionName(value: string | null): boolean {
  return (
    value === ToolNameNormalizationConfig.askUserQuestionToolName ||
    value === ToolNameNormalizationConfig.approvalToolName
  );
}

function extractToolName(value: Record<string, unknown>): string | undefined {
  const toolName = readOptionalString(value.toolName);
  if (toolName) {
    return toolName;
  }
  const tool = value.tool;
  if (!isRecord(tool)) {
    return undefined;
  }
  return readOptionalString(tool.name);
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseToolCallArguments(value: string): unknown | null {
  const parsed = safeJsonParse(value);
  if (parsed !== null) {
    return parsed;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];
    if (char !== "{" && char !== "[") {
      continue;
    }
    const candidate = trimmed.slice(index);
    const recovered = safeJsonParse(candidate);
    if (recovered !== null) {
      return recovered;
    }
  }
  return null;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value;
}

function readBooleanWithFallback(primary: unknown, fallback: unknown): boolean {
  if (typeof primary === "boolean") {
    return primary;
  }
  return Boolean(fallback);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
