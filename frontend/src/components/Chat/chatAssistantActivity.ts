import { C } from "utils/c";
import { normalizeToolName } from "utils/claudeTools";
import {
  type BaseChatMessageUnion,
  ChatRoleEnum,
  type ToolCall,
  type ToolChatMessage,
} from "utils/generatedTypes";

export type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: "assistant" }
>;
export type ChatContentItem = AssistantChatMessage["content"][number];
export type ThinkingContentItem = Extract<
  ChatContentItem,
  { type: typeof C.LLM_THINKING }
>;

export type ToolResultValue = ToolChatMessage["result"] | string;
export type ToolCallRenderEntry = {
  toolCall: ToolCall;
  isStreaming: boolean;
};

export type ThinkingRenderEntry = {
  item: ThinkingContentItem;
  messageId: string;
  itemIndex: number;
  timerRunKey: string;
  timestampMs: number | null;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

export type ActivityMessageContext = {
  message: AssistantChatMessage;
  isStreaming: boolean;
  wasInterrupted: boolean;
};

export type ToolCallDisplayKind =
  | "tool"
  | "action"
  | "compaction"
  | "terminal"
  | "subagent";

export type ActivityTimelineEntry =
  | {
      kind: "thinking";
      key: string;
      thinkingEntry: ThinkingRenderEntry;
    }
  | {
      kind: ToolCallDisplayKind;
      key: string;
      messageId: string;
      toolEntry: ToolCallRenderEntry;
    };

export type ActivityPreviewData = {
  label: string;
  kind:
    | "none"
    | "thought"
    | "context"
    | "action"
    | "tool"
    | "terminal"
    | "subagent";
  thoughtText: string | null;
  thoughtActivityKey: string | null;
  hasStreamingThought: boolean;
  shouldScrambleTitle: boolean;
};

type AssistantDisplayItem = {
  item: ChatContentItem;
  fullIndex: number;
};

type AssistantContentPartition = {
  thinkingItems: ThinkingContentItem[];
  displayItems: AssistantDisplayItem[];
};

type StreamActivitySummary = {
  activityKey: string;
  lastTextIndex: number;
};

const CONTEXT_COMPACTION_TOOL_NAME = "compacted";
const ACTION_TOOL_NAMES = new Set<string>([
  "command_execution",
  "file_change",
  "webSearch",
  "imageView",
  "collabToolCall",
  "enteredReviewMode",
  "exitedReviewMode",
]);
const ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES = new Set<string>([
  "command_execution",
]);
const ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES = new Set<string>([
  "setta__run_agent_profile",
  "run_agent_profile",
]);
const ASSISTANT_ERROR_PREFIX = "[Error]";

export function formatToolArgs(args: unknown): string {
  if (!args) {
    return "{}";
  }
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractNonEmptyStringArg(
  args: unknown,
  key: string,
): string | null {
  if (!isRecord(args)) {
    return null;
  }
  const value = args[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveToolDisplayName(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string | null {
  const toolResult = toolResultsById[entry.toolCall.id];
  const fromResult = normalizeToolName(toolResult?.tool_name);
  if (fromResult) {
    return fromResult;
  }
  return normalizeToolName(entry.toolCall.function?.name);
}

function resolveToolRawName(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string {
  const toolResult = toolResultsById[entry.toolCall.id];
  if (
    typeof toolResult?.tool_name === "string" &&
    toolResult.tool_name.trim()
  ) {
    return toolResult.tool_name.trim();
  }
  if (
    typeof entry.toolCall.function?.name === "string" &&
    entry.toolCall.function.name.trim()
  ) {
    return entry.toolCall.function.name.trim();
  }
  return "";
}

function resolveRuntimeToolCategory(
  toolName: string | null,
): "terminal" | "subagent" | null {
  if (!toolName) {
    return null;
  }
  const normalizedToolName = normalizeToolName(toolName);
  if (!normalizedToolName) {
    return null;
  }
  const lowerCaseToolName = normalizedToolName.toLowerCase();
  if (ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES.has(lowerCaseToolName)) {
    return "terminal";
  }
  if (ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES.has(lowerCaseToolName)) {
    return "subagent";
  }
  return null;
}

function resolveActiveRuntimeDisplayKind(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): "terminal" | "subagent" | null {
  if (!entry.isStreaming) {
    return null;
  }
  if (toolResultsById[entry.toolCall.id]) {
    return null;
  }
  return resolveRuntimeToolCategory(
    resolveToolDisplayName(entry, toolResultsById),
  );
}

function resolveToolCallDisplayKind(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): ToolCallDisplayKind {
  const runtimeDisplayKind = resolveActiveRuntimeDisplayKind(
    entry,
    toolResultsById,
  );
  if (runtimeDisplayKind) {
    return runtimeDisplayKind;
  }
  const normalizedName = resolveToolDisplayName(entry, toolResultsById);
  if (normalizedName === CONTEXT_COMPACTION_TOOL_NAME) {
    return "compaction";
  }
  if (normalizedName && ACTION_TOOL_NAMES.has(normalizedName)) {
    return "action";
  }
  const rawName = resolveToolRawName(entry, toolResultsById);
  if (rawName.startsWith("mcp__")) {
    return "action";
  }
  return "tool";
}

function hashStringToBase36(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function resolveThinkingTimerRunKey({
  messageId,
  itemIndex,
  item,
}: {
  messageId: string;
  itemIndex: number;
  item: ThinkingContentItem;
}): string {
  const signature = item.signature?.trim();
  if (signature && signature.length > 0) {
    return `thinking-signature-${hashStringToBase36(signature)}`;
  }
  return `thinking-${messageId}-${itemIndex}`;
}

function resolveTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function resolveMessageCreatedAtMs(
  message: BaseChatMessageUnion,
): number | null {
  return resolveTimestampMs((message as { createdAt?: unknown }).createdAt);
}

export function resolveActivityTimestampMs(
  startedAtMs: number | null,
  completedAtMs: number | null,
): number | null {
  return resolveTimestampMs(startedAtMs) ?? resolveTimestampMs(completedAtMs);
}

function isThinkingContentItem(
  item: ChatContentItem,
): item is ThinkingContentItem {
  return item.type === C.LLM_THINKING;
}

export function partitionAssistantContent(
  content: ChatContentItem[],
): AssistantContentPartition {
  const thinkingItems: ThinkingContentItem[] = [];
  const displayItems: AssistantDisplayItem[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (isThinkingContentItem(item)) {
      thinkingItems.push(item);
      continue;
    }
    displayItems.push({ item, fullIndex: index });
  }
  return { thinkingItems, displayItems };
}

function isMeaningfulAssistantDisplayItem(item: ChatContentItem): boolean {
  if (item.type === C.LLM_TEXT) {
    return item.text.trim().length > 0;
  }
  if (item.type === "image_url") {
    return item.image_url.url.trim().length > 0;
  }
  return false;
}

export function hasMeaningfulAssistantDisplayItems(
  displayItems: AssistantDisplayItem[],
): boolean {
  return displayItems.some(({ item }) =>
    isMeaningfulAssistantDisplayItem(item),
  );
}

export function buildActivityTimelineEntries(
  messageContexts: ActivityMessageContext[],
  toolResultsById: Record<string, ToolChatMessage>,
): ActivityTimelineEntry[] {
  const timelineEntries: ActivityTimelineEntry[] = [];
  for (const messageContext of messageContexts) {
    const { message, isStreaming, wasInterrupted } = messageContext;
    const { thinkingItems, displayItems } = partitionAssistantContent(
      message.content,
    );
    const thinkingIsStreaming =
      isStreaming && !hasMeaningfulAssistantDisplayItems(displayItems);
    const thinkingTimestampMs = resolveMessageCreatedAtMs(message);
    for (let itemIndex = 0; itemIndex < thinkingItems.length; itemIndex += 1) {
      const item = thinkingItems[itemIndex];
      if (!item) {
        continue;
      }
      timelineEntries.push({
        kind: "thinking",
        key: `${message.id}-thinking-${itemIndex}`,
        thinkingEntry: {
          item,
          messageId: message.id,
          itemIndex,
          timerRunKey: resolveThinkingTimerRunKey({
            messageId: message.id,
            itemIndex,
            item,
          }),
          timestampMs: thinkingTimestampMs,
          isStreaming: thinkingIsStreaming,
          wasInterrupted,
        },
      });
    }
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      const toolEntry: ToolCallRenderEntry = { toolCall, isStreaming };
      timelineEntries.push({
        kind: resolveToolCallDisplayKind(toolEntry, toolResultsById),
        key: toolCall.id,
        messageId: message.id,
        toolEntry,
      });
    }
  }
  return timelineEntries;
}

export function resolveActionLabel(name: string, args: unknown): string {
  const normalized = normalizeToolName(name) ?? name;
  if (normalized === "command_execution") {
    const command = extractNonEmptyStringArg(args, "command");
    if (command) {
      return command;
    }
    return "Run command";
  }
  if (normalized === "file_change") {
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
  return normalized || "Action";
}

export function resolveDisplayArgsForToolCallEntry({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): unknown {
  const argsFromResult = toolResult?.arguments;
  const argsFromAssistant = toolCall.function?.arguments;
  const pendingArgs = toolCallArguments[toolCall.id];
  if (argsFromResult && Object.keys(argsFromResult).length > 0) {
    return argsFromResult;
  }
  if (argsFromAssistant && Object.keys(argsFromAssistant).length > 0) {
    return argsFromAssistant;
  }
  return pendingArgs;
}

function resolveToolResultDisplay(
  result: ToolResultValue | undefined,
): string | null {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (trimmed.length > 0) {
      return result;
    }
    return null;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (result && typeof result === "object") {
    return formatToolArgs(result);
  }
  return null;
}

export function resolveCompactionSummaryText(
  entries: ToolCallRenderEntry[],
  toolResultsById: Record<string, ToolChatMessage>,
  toolCallArguments: Record<string, string>,
): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const toolResult = toolResultsById[entry.toolCall.id];
    const resultDisplay = resolveToolResultDisplay(
      formatToolResult(toolResult),
    );
    if (resultDisplay) {
      return resultDisplay;
    }
    const argsFromMessage = entry.toolCall.function?.arguments;
    const pendingArgs = toolCallArguments[entry.toolCall.id];
    if (isRecord(argsFromMessage) && Object.keys(argsFromMessage).length > 0) {
      return formatToolArgs(argsFromMessage);
    }
    if (pendingArgs && pendingArgs.trim().length > 0) {
      return pendingArgs;
    }
  }
  return null;
}

function resolveActionEntryLabel(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
  toolCallArguments: Record<string, string>,
): string {
  const toolCall = entry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  const rawToolName =
    toolResult?.tool_name || toolCall.function?.name || `Action ${toolCall.id}`;
  const argsToDisplay = resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  return resolveActionLabel(rawToolName, argsToDisplay);
}

function resolveToolEntryLabel(
  entry: ToolCallRenderEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): string {
  const latestResult = toolResultsById[entry.toolCall.id];
  return (
    latestResult?.tool_name ||
    entry.toolCall.function?.name ||
    `Tool call ${entry.toolCall.id}`
  );
}

function resolveSubagentEntryLabel({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const toolCall = entry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  const rawToolName =
    toolResult?.tool_name ||
    toolCall.function?.name ||
    `Subagent ${toolCall.id}`;
  const argsToDisplay = resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  const profileId = extractNonEmptyStringArg(argsToDisplay, "profileId");
  if (profileId) {
    return profileId;
  }
  return normalizeToolName(rawToolName) ?? rawToolName;
}

export function resolveCompactionEntryLabel({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  return (
    resolveCompactionSummaryText([entry], toolResultsById, toolCallArguments) ??
    "Compaction completed."
  );
}

function resolveLatestThoughtPreview(
  timelineEntries: ActivityTimelineEntry[],
): { activityKey: string | null; thoughtText: string | null } {
  for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const thoughtText = entry.thinkingEntry.item.thinking.trim();
    if (thoughtText.length > 0) {
      return {
        activityKey: entry.key,
        thoughtText,
      };
    }
  }
  return {
    activityKey: null,
    thoughtText: null,
  };
}

function resolveHasStreamingThought(
  timelineEntries: ActivityTimelineEntry[],
): boolean {
  return timelineEntries.some(
    (entry) => entry.kind === "thinking" && entry.thinkingEntry.isStreaming,
  );
}

export function deriveThinkingHeadlineFromContent(
  content: string,
): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalizedLines = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#+\s+/u, "")
        .replace(/^(?:>+|\*|-)\s*/u, "")
        .replace(/^\d+\.\s*/u, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
  const collapsed =
    normalizedLines[0] ??
    trimmed
      .replace(/\s+/gu, " ")
      .replace(/^#+\s+/u, "")
      .replace(/^(?:>+|\*|-)\s*/u, "")
      .replace(/^\d+\.\s*/u, "")
      .trim();
  if (collapsed.length === 0) {
    return null;
  }
  const maxLength = 96;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength).trimEnd()}...`;
}

function resolveThinkingSummaryMeta({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): { headline: string; hasTitle: boolean } {
  if (isStreaming) {
    return { headline: "Thinking...", hasTitle: false };
  }
  const summaryText = summary?.trim() ?? "";
  const hasThinkingText = content.trim().length > 0;
  const summaryHeadlineSourceText = (
    summaryText.split(/\r?\n/u)[0] ?? ""
  ).trim();
  const normalizedSummaryText = summaryText.replace(/\s+/gu, " ").trim();
  const normalizedThinkingText = content.replace(/\s+/gu, " ").trim();
  const summaryLooksLikeThinking =
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText;
  const collapsedSummaryText =
    summaryLooksLikeThinking || summaryHeadlineSourceText.length === 0
      ? ""
      : summaryHeadlineSourceText;
  if (collapsedSummaryText) {
    return { headline: collapsedSummaryText, hasTitle: true };
  }
  if (hasThinkingText) {
    const derivedHeadline = deriveThinkingHeadlineFromContent(content);
    if (derivedHeadline) {
      return { headline: derivedHeadline, hasTitle: true };
    }
    return {
      headline: "Summary unavailable. Expand to view full reasoning.",
      hasTitle: false,
    };
  }
  return {
    headline: isStreaming ? "Thinking..." : "Reasoning complete.",
    hasTitle: false,
  };
}

function resolveStreamingThinkingHeadline({
  content,
  summary,
}: {
  content: string;
  summary: string | null | undefined;
}): string | null {
  const summaryText = summary?.trim() ?? "";
  const summaryHeadlineSourceText = (
    summaryText.split(/\r?\n/u)[0] ?? ""
  ).trim();
  const normalizedSummaryText = summaryText.replace(/\s+/gu, " ").trim();
  const normalizedThinkingText = content.replace(/\s+/gu, " ").trim();
  const summaryLooksLikeThinking =
    normalizedSummaryText.length > 0 &&
    normalizedThinkingText.length > 0 &&
    normalizedSummaryText === normalizedThinkingText;
  if (summaryHeadlineSourceText.length > 0 && !summaryLooksLikeThinking) {
    return summaryHeadlineSourceText;
  }
  return deriveThinkingHeadlineFromContent(content);
}

export function resolveThinkingSummaryHeadline({
  content,
  summary,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  isStreaming: boolean;
}): string {
  if (isStreaming) {
    return (
      resolveStreamingThinkingHeadline({ content, summary }) ?? "Thinking..."
    );
  }
  return resolveThinkingSummaryMeta({ content, summary, isStreaming }).headline;
}

export function resolveCollapsedThinkingActivityLabel({
  isStreaming,
}: {
  isStreaming: boolean;
}): string {
  return isStreaming ? "Thinking" : "Reasoning";
}

export function resolveLatestThinkingSummary(
  thinkingItems: ThinkingContentItem[],
  isStreaming: boolean,
): string {
  const latestItem = thinkingItems[thinkingItems.length - 1];
  if (!latestItem) {
    return "No thoughts yet.";
  }
  return resolveThinkingSummaryHeadline({
    content: latestItem.thinking,
    summary: latestItem.summary,
    isStreaming,
  });
}

function resolveThinkingPreviewHeadline(entry: ThinkingRenderEntry): {
  headline: string | null;
  shouldScramble: boolean;
} {
  if (entry.isStreaming) {
    const streamingHeadline = resolveStreamingThinkingHeadline({
      content: entry.item.thinking,
      summary: entry.item.summary,
    });
    if (streamingHeadline) {
      return { headline: streamingHeadline, shouldScramble: false };
    }
    return { headline: null, shouldScramble: true };
  }
  const summaryMeta = resolveThinkingSummaryMeta({
    content: entry.item.thinking,
    summary: entry.item.summary,
    isStreaming: entry.isStreaming,
  });
  if (summaryMeta.hasTitle) {
    return { headline: summaryMeta.headline, shouldScramble: false };
  }
  return { headline: null, shouldScramble: false };
}

function resolveFallbackThinkingHeadline(
  timelineEntries: ActivityTimelineEntry[],
  startIndex: number,
): string | null {
  for (let index = startIndex; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const nextHeadline = resolveThinkingPreviewHeadline(entry.thinkingEntry);
    if (nextHeadline.headline) {
      return nextHeadline.headline;
    }
  }
  return null;
}

export function resolveLatestActivityPreview({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): ActivityPreviewData {
  const hasStreamingThought = resolveHasStreamingThought(timelineEntries);
  const { activityKey: thoughtActivityKey, thoughtText } =
    resolveLatestThoughtPreview(timelineEntries);
  const thinkingEntryCount = timelineEntries.filter(
    (entry) => entry.kind === "thinking",
  ).length;
  const hasThoughtPreviewText = (thoughtText?.trim().length ?? 0) > 0;
  const latestEntry = timelineEntries[timelineEntries.length - 1];
  if (!latestEntry) {
    return {
      label: "No recent activity",
      kind: "none",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "thinking") {
    if (hasThoughtPreviewText) {
      return {
        label: hasStreamingThought
          ? "Thinking"
          : thinkingEntryCount > 1
            ? "Thoughts"
            : "Reasoning",
        kind: "thought",
        thoughtText,
        thoughtActivityKey,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    const latestHeadline = resolveThinkingPreviewHeadline(
      latestEntry.thinkingEntry,
    );
    if (latestHeadline.headline) {
      return {
        label: latestHeadline.headline,
        kind: "thought",
        thoughtText,
        thoughtActivityKey,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    const fallbackHeadline = resolveFallbackThinkingHeadline(
      timelineEntries,
      timelineEntries.length - 2,
    );
    if (fallbackHeadline) {
      return {
        label: fallbackHeadline,
        kind: "thought",
        thoughtText,
        thoughtActivityKey,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    if (latestHeadline.shouldScramble) {
      return {
        label: "Thinking",
        kind: "thought",
        thoughtText,
        thoughtActivityKey,
        hasStreamingThought,
        shouldScrambleTitle: false,
      };
    }
    return {
      label: "Reasoning",
      kind: "thought",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "compaction") {
    return {
      label: `Context: ${resolveCompactionEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      kind: "context",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "action") {
    return {
      label: `Action: ${resolveActionEntryLabel(
        latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      )}`,
      kind: "action",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "terminal") {
    return {
      label: `Terminal: ${resolveActionEntryLabel(
        latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      )}`,
      kind: "terminal",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  if (latestEntry.kind === "subagent") {
    return {
      label: `Subagent: ${resolveSubagentEntryLabel({
        entry: latestEntry.toolEntry,
        toolResultsById,
        toolCallArguments,
      })}`,
      kind: "subagent",
      thoughtText,
      thoughtActivityKey,
      hasStreamingThought,
      shouldScrambleTitle: false,
    };
  }
  return {
    label: `Action: ${resolveToolEntryLabel(
      latestEntry.toolEntry,
      toolResultsById,
    )}`,
    kind: "tool",
    thoughtText,
    thoughtActivityKey,
    hasStreamingThought,
    shouldScrambleTitle: false,
  };
}

export function isAssistantErrorText(text: string): boolean {
  return text.trimStart().startsWith(ASSISTANT_ERROR_PREFIX);
}

export function stripAssistantErrorPrefix(text: string): string {
  const next = text.replace(/^\s*\[Error\]\s*/u, "");
  return next.trim().length > 0 ? next : "The AI request failed.";
}

export function getStreamActivitySummary(
  content: ChatContentItem[],
): StreamActivitySummary {
  let textLength = 0;
  let thinkingLength = 0;
  let summaryLength = 0;
  let signatureLength = 0;
  let imageCount = 0;
  let lastTextIndex = -1;
  for (let index = 0; index < content.length; index += 1) {
    const item = content[index];
    if (item.type === C.LLM_TEXT) {
      textLength += item.text.length;
      lastTextIndex = index;
      continue;
    }
    if (item.type === C.LLM_THINKING) {
      thinkingLength += item.thinking.length;
      if (item.summary) {
        summaryLength += item.summary.length;
      }
      if (item.signature) {
        signatureLength += item.signature.length;
      }
      continue;
    }
    if (item.type === "image_url") {
      imageCount += 1;
    }
  }
  return {
    activityKey: `${textLength}-${thinkingLength}-${summaryLength}-${signatureLength}-${imageCount}`,
    lastTextIndex,
  };
}

export function isAssistantActivityOnlyMessage(
  message: BaseChatMessageUnion,
): message is AssistantChatMessage {
  if (message.role !== ChatRoleEnum.assistant) {
    return false;
  }
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
  if (attachments.length > 0) {
    return false;
  }
  const { thinkingItems, displayItems } = partitionAssistantContent(
    message.content,
  );
  if (displayItems.length > 0) {
    return false;
  }
  const toolCalls = message.tool_calls ?? [];
  return thinkingItems.length > 0 || toolCalls.length > 0;
}

export function hasAssistantActivityContent(
  message: AssistantChatMessage,
): boolean {
  const { thinkingItems } = partitionAssistantContent(message.content);
  const toolCalls = message.tool_calls ?? [];
  return thinkingItems.length > 0 || toolCalls.length > 0;
}

export function formatToolResult(
  toolResult: ToolChatMessage | undefined,
): ToolResultValue | undefined {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    const renderedEntries = toolResult.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text;
        }
        if (entry.type === "tool_reference") {
          return `Tool reference: ${entry.tool_name}`;
        }
        if (entry.type === "resource") {
          const label = entry.resource?.uri
            ? `Resource: ${entry.resource.uri}`
            : "Resource";
          return entry.resource?.mimeType
            ? `${label} (${entry.resource.mimeType})`
            : label;
        }
        if (entry.type === "image") {
          return entry.mimeType ? `Image (${entry.mimeType})` : "Image";
        }
        return JSON.stringify(entry, null, 2);
      })
      .filter((entry) => entry.trim().length > 0);
    if (renderedEntries.length > 0) {
      return renderedEntries.join("\n\n");
    }
  }
  return toolResult.result;
}

function getPlainTextFromMessage(message: BaseChatMessageUnion): string {
  const content = message.content ?? [];
  const output: string[] = [];
  for (const item of content) {
    if (item.type === C.LLM_TEXT) {
      output.push(item.text);
    } else if (item.type === C.LLM_THINKING) {
      output.push(item.thinking);
    }
  }
  return output.join("\n\n").trim();
}

export function buildCopyTextForMessage({
  message,
  toolResultsById,
  toolCallArguments,
}: {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const output: string[] = [];
  const plainText = getPlainTextFromMessage(message);
  if (plainText.length > 0) {
    output.push(plainText);
  }
  if (message.role !== ChatRoleEnum.assistant) {
    return output.join("\n\n").trim();
  }
  const toolCalls = message.tool_calls ?? [];
  for (const toolCall of toolCalls) {
    const toolResult = toolResultsById[toolCall.id];
    const toolName =
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`;
    const lines: string[] = [toolName];
    const args = resolveDisplayArgsForToolCallEntry({
      toolCall,
      toolResult,
      toolCallArguments,
    });
    if (args) {
      lines.push(`Arguments:\n${formatToolArgs(args)}`);
    }
    const result = formatToolResult(toolResult);
    if (result !== undefined) {
      if (typeof result === "string" && result.trim().length > 0) {
        lines.push(`Result:\n${result}`);
      } else if (typeof result === "number" || typeof result === "boolean") {
        lines.push(`Result:\n${String(result)}`);
      } else if (result && typeof result === "object") {
        lines.push(`Result:\n${formatToolArgs(result)}`);
      }
    }
    output.push(lines.join("\n"));
  }
  return output.join("\n\n").trim();
}

export function buildCopyTextForAssistantActivityMessage({
  message,
  toolResultsById,
  toolCallArguments,
}: {
  message: AssistantChatMessage;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  const activityOnlyContent = message.content.filter(isThinkingContentItem);
  const hasActivityContent =
    activityOnlyContent.length > 0 || (message.tool_calls ?? []).length > 0;
  if (!hasActivityContent) {
    return "";
  }
  const activityOnlyMessage: AssistantChatMessage = {
    ...message,
    content: activityOnlyContent,
    attachments: [],
  };
  return buildCopyTextForMessage({
    message: activityOnlyMessage,
    toolResultsById,
    toolCallArguments,
  });
}

export function buildCopyTextForActivityTimelineEntry({
  entry,
  toolResultsById,
  toolCallArguments,
}: {
  entry: ActivityTimelineEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  if (entry.kind === "thinking") {
    const syntheticMessage: AssistantChatMessage = {
      id: `activity-copy-thinking-${entry.key}`,
      role: ChatRoleEnum.assistant,
      content: [entry.thinkingEntry.item],
      attachments: [],
      tool_calls: null,
    };
    return buildCopyTextForAssistantActivityMessage({
      message: syntheticMessage,
      toolResultsById,
      toolCallArguments,
    });
  }

  const syntheticMessage: AssistantChatMessage = {
    id: `activity-copy-tool-${entry.key}`,
    role: ChatRoleEnum.assistant,
    content: [],
    attachments: [],
    tool_calls: [entry.toolEntry.toolCall],
  };
  return buildCopyTextForAssistantActivityMessage({
    message: syntheticMessage,
    toolResultsById,
    toolCallArguments,
  });
}
