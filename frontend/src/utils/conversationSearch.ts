import {
  AgentRun,
  BaseChatMessageUnion,
  ChatRoleEnum,
} from "utils/generatedTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushTrimmedString(target: Array<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }
  target.push(trimmed);
}

function pushSerializedValue(target: Array<string>, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    pushTrimmedString(target, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    target.push(String(value));
    return;
  }
  if (Array.isArray(value) || isRecord(value)) {
    try {
      const serialized = JSON.stringify(value);
      pushTrimmedString(target, serialized);
    } catch {
      // Intentionally ignore non-serializable values.
    }
  }
}

function collectContentBlockSearchText(
  block: unknown,
  target: Array<string>,
): void {
  if (!isRecord(block)) {
    return;
  }
  pushTrimmedString(target, block.text);
  pushTrimmedString(target, block.thinking);
  pushTrimmedString(target, block.summary);
  pushTrimmedString(target, block.title);
}

export function buildSearchableTextForMessage(
  message: BaseChatMessageUnion,
): string {
  const segments: Array<string> = [];

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      collectContentBlockSearchText(block, segments);
    }
  }

  if ("attachments" in message && Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      pushTrimmedString(segments, attachment.name);
    }
  }

  if (message.role === ChatRoleEnum.assistant) {
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      pushTrimmedString(segments, toolCall.function?.name);
      pushSerializedValue(segments, toolCall.function?.arguments);
    }
  } else if (message.role === ChatRoleEnum.tool) {
    pushSerializedValue(segments, message.result);
  }

  return segments.join("\n");
}

export function buildSearchableTextForMessages(
  messages: Array<BaseChatMessageUnion>,
): string {
  const segments: Array<string> = [];
  for (const message of messages) {
    const text = buildSearchableTextForMessage(message);
    if (text.length === 0) {
      continue;
    }
    segments.push(text);
  }
  return segments.join("\n");
}

export function tokenizeConversationSearchQuery(query: string): Array<string> {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((segment) => segment.length > 0);
}

export function matchesConversationSearchText(
  text: string,
  normalizedSearchTerms: Array<string>,
): boolean {
  if (normalizedSearchTerms.length === 0) {
    return true;
  }
  const normalizedText = text.toLowerCase();
  for (const term of normalizedSearchTerms) {
    if (!normalizedText.includes(term)) {
      return false;
    }
  }
  return true;
}

function countTermOccurrences(normalizedText: string, term: string): number {
  if (term.length === 0) {
    return 0;
  }
  let count = 0;
  let cursor = 0;
  while (cursor <= normalizedText.length - term.length) {
    const nextIndex = normalizedText.indexOf(term, cursor);
    if (nextIndex === -1) {
      break;
    }
    count += 1;
    cursor = nextIndex + term.length;
  }
  return count;
}

export function countConversationSearchTextMatches(
  text: string,
  normalizedSearchTerms: Array<string>,
): number {
  if (normalizedSearchTerms.length === 0) {
    return 0;
  }
  const normalizedText = text.toLowerCase();
  let totalMatches = 0;
  for (const term of normalizedSearchTerms) {
    const termMatches = countTermOccurrences(normalizedText, term);
    if (termMatches === 0) {
      return 0;
    }
    totalMatches += termMatches;
  }
  return totalMatches;
}

export function extractRunMessagesForConversationSearch(
  run: AgentRun,
): Array<BaseChatMessageUnion> {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const outputMessages = outputs?.messages;
  if (Array.isArray(outputMessages)) {
    return outputMessages as Array<BaseChatMessageUnion>;
  }
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const inputMessages = inputs?.messages;
  if (Array.isArray(inputMessages)) {
    return inputMessages as Array<BaseChatMessageUnion>;
  }
  return [];
}
