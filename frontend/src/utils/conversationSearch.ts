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

type SearchableToolCall = {
  function?: {
    name?: unknown;
    arguments?: unknown;
  } | null;
} | null;

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

function stripMarkdownLinksToVisibleText(value: string): string {
  return value.replace(/!?\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/gu, "$1");
}

function normalizeVisibleMarkdownSearchText(value: string): string {
  return stripMarkdownLinksToVisibleText(
    excludeMarkdownCodeFromSearchText(value),
  );
}

function pushSearchableString(target: Array<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = normalizeVisibleMarkdownSearchText(value).trim();
  if (trimmed.length === 0) {
    return;
  }
  target.push(trimmed);
}

function deriveThinkingSearchHeadline(
  thinking: unknown,
  summary: unknown,
): string | null {
  const summaryText = typeof summary === "string" ? summary.trim() : "";
  if (summaryText.length > 0) {
    return (summaryText.split(/\r?\n/u)[0] ?? "").trim() || null;
  }
  if (typeof thinking !== "string") {
    return null;
  }
  const collapsed = thinking.replace(/\s+/gu, " ").trim();
  if (collapsed.length === 0) {
    return null;
  }
  const maxLength = 96;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength).trimEnd()}...`;
}

function normalizeToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/gu, "_");
}

function extractNonEmptyStringArg(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const nextValue = value[key];
  if (typeof nextValue !== "string") {
    return null;
  }
  const trimmed = nextValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveActionSearchLabel(name: string, args: unknown): string {
  const normalizedName = normalizeToolName(name);
  if (normalizedName === "command_execution") {
    return extractNonEmptyStringArg(args, "command") ?? "Run command";
  }
  if (normalizedName === "file_change") {
    const path =
      extractNonEmptyStringArg(args, "path") ??
      extractNonEmptyStringArg(args, "filePath");
    if (path) {
      return `Edit ${path}`;
    }
    return "Edit file";
  }
  if (name.startsWith("mcp__")) {
    return `MCP ${name.slice("mcp__".length)}`;
  }
  return normalizedName || "Action";
}

function pushAssistantActivityPreviewSearchText(
  message: BaseChatMessageUnion,
  target: Array<string>,
): void {
  if (message.role !== ChatRoleEnum.assistant) {
    return;
  }
  const toolCalls = message.tool_calls ?? [];
  const latestToolCall = toolCalls[toolCalls.length - 1] as
    | SearchableToolCall
    | undefined;
  const latestToolCallName = latestToolCall?.function?.name;
  if (typeof latestToolCallName === "string" && latestToolCallName.trim()) {
    target.push(
      resolveActionSearchLabel(
        latestToolCallName,
        latestToolCall.function?.arguments,
      ),
    );
    return;
  }

  if (!Array.isArray(message.content)) {
    return;
  }
  for (let index = message.content.length - 1; index >= 0; index -= 1) {
    const block = message.content[index];
    if (!isRecord(block) || block.type !== "thinking") {
      continue;
    }
    const headline = deriveThinkingSearchHeadline(
      block.thinking,
      block.summary,
    );
    if (headline) {
      target.push(headline);
      return;
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
  if (block.type === "text") {
    pushSearchableString(target, block.text);
    return;
  }
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

  if (message.role === ChatRoleEnum.tool) {
    return "";
  }

  pushAssistantActivityPreviewSearchText(message, segments);

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
