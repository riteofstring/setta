import {
  AgentRun,
  BaseChatMessageUnion,
  ChatRoleEnum,
} from "utils/generatedTypes";

export type ConversationSearchTextRange = {
  start: number;
  end: number;
};

type MarkdownFence = {
  character: "`" | "~";
  length: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMarkdownFence(line: string): MarkdownFence | null {
  const match = line.match(/^[ \t]{0,3}([`~]{3,})/u);
  if (!match) {
    return null;
  }
  const marker = match[1];
  if (!marker) {
    return null;
  }
  const firstCharacter = marker[0];
  if (firstCharacter !== "`" && firstCharacter !== "~") {
    return null;
  }
  return {
    character: firstCharacter,
    length: marker.length,
  };
}

function stripInlineMarkdownCode(line: string): string {
  let output = "";
  let cursor = 0;

  while (cursor < line.length) {
    if (line[cursor] !== "`") {
      output += line[cursor];
      cursor += 1;
      continue;
    }

    let delimiterLength = 1;
    while (line[cursor + delimiterLength] === "`") {
      delimiterLength += 1;
    }
    const delimiter = "`".repeat(delimiterLength);
    const closingIndex = line.indexOf(delimiter, cursor + delimiterLength);
    if (closingIndex === -1) {
      output += delimiter;
      cursor += delimiterLength;
      continue;
    }

    output += " ";
    cursor = closingIndex + delimiterLength;
  }

  return output;
}

function excludeMarkdownCodeFromSearchText(value: string): string {
  const lines = value.split("\n");
  const visibleLines: Array<string> = [];
  let activeFence: MarkdownFence | null = null;

  for (const line of lines) {
    const fence = parseMarkdownFence(line);
    if (activeFence) {
      if (
        fence &&
        fence.character === activeFence.character &&
        fence.length >= activeFence.length
      ) {
        activeFence = null;
      }
      visibleLines.push("");
      continue;
    }
    if (fence) {
      activeFence = fence;
      visibleLines.push("");
      continue;
    }
    visibleLines.push(stripInlineMarkdownCode(line));
  }

  return visibleLines.join("\n");
}

function pushSearchableString(target: Array<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = excludeMarkdownCodeFromSearchText(value).trim();
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
    pushSearchableString(target, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    target.push(String(value));
    return;
  }
  if (Array.isArray(value) || isRecord(value)) {
    try {
      const serialized = JSON.stringify(value);
      pushSearchableString(target, serialized);
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
  pushSearchableString(target, block.text);
  pushSearchableString(target, block.thinking);
  pushSearchableString(target, block.summary);
  pushSearchableString(target, block.title);
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
      pushSearchableString(segments, attachment.name);
    }
  }

  if (message.role === ChatRoleEnum.assistant) {
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      pushSearchableString(segments, toolCall.function?.name);
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
  const seen = new Set<string>();
  const tokens: Array<string> = [];
  for (const segment of query.trim().toLowerCase().split(/\s+/u)) {
    if (!segment || seen.has(segment)) {
      continue;
    }
    seen.add(segment);
    tokens.push(segment);
  }
  return tokens;
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

function findTermRanges(
  normalizedText: string,
  term: string,
): Array<ConversationSearchTextRange> {
  if (term.length === 0) {
    return [];
  }
  const ranges: Array<ConversationSearchTextRange> = [];
  let cursor = 0;
  while (cursor <= normalizedText.length - term.length) {
    const nextIndex = normalizedText.indexOf(term, cursor);
    if (nextIndex === -1) {
      break;
    }
    ranges.push({
      start: nextIndex,
      end: nextIndex + term.length,
    });
    cursor = nextIndex + term.length;
  }
  return ranges;
}

export function findConversationSearchTextRanges(
  text: string,
  normalizedSearchTerms: Array<string>,
): Array<ConversationSearchTextRange> {
  if (normalizedSearchTerms.length === 0 || text.length === 0) {
    return [];
  }
  const normalizedText = text.toLowerCase();
  const ranges = normalizedSearchTerms.flatMap((term) =>
    findTermRanges(normalizedText, term),
  );
  if (ranges.length === 0) {
    return [];
  }
  ranges.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return left.end - right.end;
  });
  const firstRange = ranges[0];
  if (!firstRange) {
    return [];
  }
  const merged: Array<ConversationSearchTextRange> = [{ ...firstRange }];
  for (let index = 1; index < ranges.length; index += 1) {
    const current = ranges[index];
    const previous = merged[merged.length - 1];
    if (!current || !previous) {
      continue;
    }
    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}

export function countConversationSearchTextMatches(
  text: string,
  normalizedSearchTerms: Array<string>,
): number {
  if (normalizedSearchTerms.length === 0) {
    return 0;
  }
  if (!matchesConversationSearchText(text, normalizedSearchTerms)) {
    return 0;
  }
  return findConversationSearchTextRanges(text, normalizedSearchTerms).length;
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
