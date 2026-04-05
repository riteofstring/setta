import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  ToolCall,
  ToolNameNormalizationConfig,
} from "utils/generatedTypes";
import { normalizeGeneratedToolName } from "./bindingRuntime";

export const APPROVAL_TOOL_NAME = "setta.approval";
export const TODO_TOOL_NAME = "TodoWrite";
export const QUESTION_TOOL_NAME = "AskUserQuestion";

export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoItem = {
  content: string;
  status: TodoStatus;
  activeForm?: string;
};

export type TodoListPayload = {
  todos: TodoItem[];
};

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

export type ApprovalPayload = {
  approvalId?: string;
  toolName?: string;
  toolType?: string;
  tool?: unknown;
  input?: unknown;
};

export function normalizeToolName(
  name: string | null | undefined,
): string | null {
  return normalizeGeneratedToolName(
    name,
    ToolNameNormalizationConfig.singlePrefix,
    ToolNameNormalizationConfig.doublePrefix,
    ToolNameNormalizationConfig.askUserQuestionToolName,
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

export function parseTodoPayload(value: unknown): TodoListPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const todosValue = value.todos;
  if (!Array.isArray(todosValue)) {
    return null;
  }
  const todos: TodoItem[] = [];
  for (const entry of todosValue) {
    if (!isRecord(entry)) {
      continue;
    }
    const content = typeof entry.content === "string" ? entry.content : "";
    const status = parseTodoStatus(entry.status);
    if (!content || !status) {
      continue;
    }
    const activeForm =
      typeof entry.activeForm === "string" ? entry.activeForm : undefined;
    const todo: TodoItem = { content, status };
    if (activeForm) {
      todo.activeForm = activeForm;
    }
    todos.push(todo);
  }
  return { todos };
}

export function parseAskUserQuestionPayload(
  value: unknown,
): AskUserQuestionPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const questionsValue = value.questions;
  const fallbackQuestion =
    typeof value.question === "string" ? value : undefined;
  const questionEntries = Array.isArray(questionsValue)
    ? questionsValue
    : fallbackQuestion
      ? [fallbackQuestion]
      : null;
  if (!questionEntries) {
    return null;
  }
  const questions: AskUserQuestionPrompt[] = [];
  for (const entry of questionEntries) {
    if (!isRecord(entry)) {
      continue;
    }
    const question = typeof entry.question === "string" ? entry.question : "";
    if (!question) {
      continue;
    }
    const header = typeof entry.header === "string" ? entry.header : "";
    const multiSelect =
      typeof entry.multiSelect === "boolean"
        ? entry.multiSelect
        : Boolean(entry.multiple);
    const optionsValue = entry.options;
    const options: AskUserQuestionOption[] = [];
    if (Array.isArray(optionsValue)) {
      for (const optionEntry of optionsValue) {
        if (typeof optionEntry === "string") {
          const label = optionEntry.trim();
          if (label) {
            options.push({ label });
          }
          continue;
        }
        if (!isRecord(optionEntry)) {
          continue;
        }
        const label =
          typeof optionEntry.label === "string"
            ? optionEntry.label
            : typeof optionEntry.value === "string"
              ? optionEntry.value
              : "";
        if (!label) {
          continue;
        }
        const description =
          typeof optionEntry.description === "string"
            ? optionEntry.description
            : undefined;
        const option: AskUserQuestionOption = { label };
        if (description) {
          option.description = description;
        }
        options.push(option);
      }
    }
    questions.push({
      header,
      question,
      multiSelect,
      options,
    });
  }
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
  const approvalId =
    typeof value.approvalId === "string" ? value.approvalId : undefined;
  const toolName = extractToolName(value);
  const toolType =
    typeof value.toolType === "string" ? value.toolType : undefined;
  const input = "input" in value ? value.input : undefined;
  const tool = "tool" in value ? value.tool : undefined;
  return {
    ...(approvalId ? { approvalId } : {}),
    ...(toolName ? { toolName } : {}),
    ...(toolType ? { toolType } : {}),
    ...(tool !== undefined ? { tool } : {}),
    ...(input !== undefined ? { input } : {}),
  };
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
  let lastAssistantIndex = -1;
  const toolResultIndexById = new Map<string, number>();

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === ChatRoleEnum.assistant) {
      lastAssistantIndex = i;
    }
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      toolResultIndexById.set(message.tool_call_id, i);
    }
  }

  for (const message of messages) {
    if (message.role !== ChatRoleEnum.assistant) {
      continue;
    }
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      const normalizedName = normalizeToolName(toolCall.function?.name);
      if (
        normalizedName !== QUESTION_TOOL_NAME &&
        normalizedName !== APPROVAL_TOOL_NAME
      ) {
        continue;
      }
      const toolResultIndex = toolResultIndexById.get(toolCall.id);
      if (toolResultIndex === undefined) {
        return true;
      }
      if (toolResultIndex > lastAssistantIndex) {
        return true;
      }
    }
  }

  return false;
}

function extractToolName(value: Record<string, unknown>): string | undefined {
  if (typeof value.toolName === "string" && value.toolName) {
    return value.toolName;
  }
  const tool = value.tool;
  if (isRecord(tool) && typeof tool.name === "string" && tool.name) {
    return tool.name;
  }
  return undefined;
}

function parseTodoStatus(value: unknown): TodoStatus | null {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  return null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
