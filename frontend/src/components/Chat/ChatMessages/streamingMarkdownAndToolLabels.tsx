import { ReactNode, useMemo, useRef } from "react";

import { FiEdit3, FiFileText, FiTerminal, FiTrash2 } from "react-icons/fi";

import { PiWrenchFill } from "react-icons/pi";

import ReactMarkdown from "react-markdown";

import rehypeKatex from "rehype-katex";

import remarkGfm from "remark-gfm";

import remarkMath from "remark-math";

import { addTemporaryNotification } from "state/actions/notifications";

import { normalizeToolName, resolveToolCallArguments } from "utils/claudeTools";

import { ChatRoleEnum, ToolCall, ToolChatMessage } from "utils/generatedTypes";

import { getConversationSearchRehypePlugins } from "../chatSearchHighlight";

import {
  resolveStreamingThinkingHeadline,
  resolveThinkingSummaryMeta,
} from "../chatThinkingSummary";

import { resolveMessageCreatedAtMs } from "../chatTiming";

import { splitStreamingMarkdownText } from "../streamingMarkdown";

import { useTypewriterEffect } from "../useTypewriterEffect";

import {
  ACTION_TOOL_NAMES,
  ACTIVE_RUNTIME_SUBAGENT_TOOL_NAMES,
  ACTIVE_RUNTIME_TERMINAL_TOOL_NAMES,
  ActivityMessageContext,
  ActivityPreviewData,
  ActivityTimelineEntry,
  CHAT_MARKDOWN_COMPONENTS,
  CONTEXT_COMPACTION_TOOL_NAME,
  MarkdownContentProps,
  StreamingTailText,
  THOUGHT_PREVIEW_MARKDOWN_CLASS,
  THOUGHT_PREVIEW_TAIL_CLASS,
  ThinkingContentItem,
  ThinkingRenderEntry,
  ToolCallDisplayKind,
  ToolCallRenderEntry,
  ToolResultValue,
  useStreamingCommitAnimationClass,
  useStreamingGrowthAnimation,
} from "./modelAndAttachmentPreview";

import {
  hasMeaningfulAssistantDisplayItems,
  partitionAssistantContent,
} from "./activityPreviewsAndAttachmentDialog";

import { formatToolResult } from "./messageListAndFormatting";

export function StreamingMarkdownContent({
  content,
  className,
  highlightTerms = [],
}: {
  content: string;
  className: string;
  highlightTerms?: Array<string>;
}) {
  const displayText = useTypewriterEffect(content, true, {
    typingSpeed: 8,
    baseMaxCharsPerFrame: 1,
    maxCharsPerFrameCap: 4,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rehypePlugins = useMemo(() => {
    if (highlightTerms.length === 0) {
      return [rehypeKatex];
    }
    return [rehypeKatex, ...getConversationSearchRehypePlugins(highlightTerms)];
  }, [highlightTerms]);

  useStreamingGrowthAnimation(rootRef, displayText.length, true);

  return (
    <div
      ref={rootRef}
      className="inline-block max-w-full align-top"
      data-chat-streaming-markdown="true"
      data-chat-streaming-markdown-mode="full-markdown"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        className={className}
        components={CHAT_MARKDOWN_COMPONENTS}
      >
        {displayText}
      </ReactMarkdown>
    </div>
  );
}

export function ThoughtPreviewMarkdown({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
}) {
  const displayText = useTypewriterEffect(text, animate, {
    typingSpeed: 9,
    baseMaxCharsPerFrame: 1,
    maxCharsPerFrameCap: 3,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { committedMarkdown, activeTailText, committedLineCount } = useMemo(
    () =>
      animate
        ? splitStreamingMarkdownText(displayText)
        : {
            committedMarkdown: displayText,
            activeTailText: "",
            committedLineCount: 0,
          },
    [animate, displayText],
  );
  const commitAnimationClass = useStreamingCommitAnimationClass(
    committedLineCount,
    animate,
  );

  useStreamingGrowthAnimation(rootRef, committedLineCount, animate);

  return (
    <div
      ref={rootRef}
      data-chat-assistant-activity-thought-markdown-preview="true"
      data-chat-assistant-activity-thought-markdown-mode={
        animate ? "line-committed" : "static"
      }
    >
      {committedMarkdown ? (
        <div className={commitAnimationClass}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className={THOUGHT_PREVIEW_MARKDOWN_CLASS}
            components={CHAT_MARKDOWN_COMPONENTS}
          >
            {committedMarkdown}
          </ReactMarkdown>
        </div>
      ) : null}
      {activeTailText ? (
        <StreamingTailText
          text={activeTailText}
          className={THOUGHT_PREVIEW_TAIL_CLASS}
          animateCharacters={animate}
          dataAttributeName="data-chat-assistant-activity-thought-stream-tail"
        />
      ) : null}
    </div>
  );
}

export function StaticMarkdownContent({
  content,
  className,
  highlightTerms = [],
}: {
  content: string;
  className: string;
  highlightTerms?: Array<string>;
}) {
  const rehypePlugins = useMemo(() => {
    if (highlightTerms.length === 0) {
      return [rehypeKatex];
    }
    return [rehypeKatex, ...getConversationSearchRehypePlugins(highlightTerms)];
  }, [highlightTerms]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={rehypePlugins}
      className={className}
      components={CHAT_MARKDOWN_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
}

export function MarkdownContent({
  content,
  className,
  role,
  isStreaming,
  highlightTerms = [],
}: MarkdownContentProps) {
  if (role === ChatRoleEnum.assistant && isStreaming) {
    return (
      <StreamingMarkdownContent
        content={content}
        className={className}
        highlightTerms={highlightTerms}
      />
    );
  }

  const markdownWidthClassName =
    role === ChatRoleEnum.assistant
      ? "inline-block max-w-full align-top"
      : "w-full max-w-full";

  return (
    <StaticMarkdownContent
      content={content}
      className={`${markdownWidthClassName} ${className}`}
      highlightTerms={highlightTerms}
    />
  );
}

export function formatToolArgs(args: unknown) {
  if (!args) return "{}";
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

export function copyTextWithNotifications({
  text,
  emptyMessage,
  successMessage,
  failureMessage,
}: {
  text: string;
  emptyMessage: string;
  successMessage: string;
  failureMessage: string;
}) {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    addTemporaryNotification(emptyMessage, "warning");
    return;
  }
  void navigator.clipboard
    .writeText(normalizedText)
    .then(() => {
      addTemporaryNotification(successMessage);
    })
    .catch((error) => {
      console.error("Failed to copy text:", error);
      addTemporaryNotification(failureMessage, "error");
    });
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

export function resolveToolDisplayName(
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

export function resolveToolRawName(
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

export function resolveToolCallDisplayKind(
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

export function resolveRuntimeToolCategory(
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

export function resolveActiveRuntimeDisplayKind(
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

export function hashStringToBase36(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function resolveThinkingTimerRunKey({
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

export const FILE_READ_ACTION_NAMES = new Set<string>([
  "read_file",
  "list_files",
  "search_files",
  "find_files",
  "glob",
  "grep",
]);

export const FILE_EDIT_ACTION_NAMES = new Set<string>([
  "file_change",
  "write_file",
  "edit_file",
  "update_file",
  "apply_patch",
  "append_file",
  "create_file",
]);

export const FILE_DELETE_ACTION_NAMES = new Set<string>([
  "delete_file",
  "remove_file",
  "unlink_file",
]);

export function resolveToolNameSuffix(name: string): string {
  const segments = name.split("__");
  const suffix = segments[segments.length - 1];
  return suffix ?? name;
}

export function toolNameMatchesActionSet(
  name: string,
  actionNames: Set<string>,
): boolean {
  if (actionNames.has(name)) {
    return true;
  }
  return actionNames.has(resolveToolNameSuffix(name));
}

export function resolveActionOperation(args: unknown): string | null {
  const operationKeys = [
    "operation",
    "action",
    "changeType",
    "editType",
    "mode",
  ];
  for (const key of operationKeys) {
    const operation = extractNonEmptyStringArg(args, key);
    if (operation) {
      return operation.toLowerCase();
    }
  }
  return null;
}

export function diffRepresentsDeletion(diffText: string): boolean {
  const normalized = diffText.toLowerCase();
  return (
    normalized.includes("deleted file mode ") ||
    normalized.includes("+++ /dev/null")
  );
}

export function resolveDiffTextFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const diff = value.diff;
  if (typeof diff !== "string") {
    return null;
  }
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return diff;
}

export function resolveActionIconFromOperation(
  operation: string | null,
): ReactNode | null {
  if (!operation) {
    return null;
  }
  if (/(delete|remove|unlink|rm)/u.test(operation)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (/(read|view|list|search|find)/u.test(operation)) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  if (
    /(edit|write|update|patch|append|create|insert|replace)/u.test(operation)
  ) {
    return <FiEdit3 size={12} className="min-w-4" />;
  }
  return null;
}

export function isDeletedFileChange(
  normalizedName: string,
  args: unknown,
  result: ToolResultValue | undefined,
): boolean {
  if (normalizedName !== "file_change") {
    return false;
  }
  return [args, result].some((value) =>
    diffRepresentsDeletion(resolveDiffTextFromUnknown(value) ?? ""),
  );
}

export function resolveActionIconFromToolName(
  normalizedName: string,
): ReactNode | null {
  if (normalizedName === "command_execution") {
    return <FiTerminal size={13} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_DELETE_ACTION_NAMES)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_EDIT_ACTION_NAMES)) {
    return <FiEdit3 size={12} className="min-w-4" />;
  }
  if (toolNameMatchesActionSet(normalizedName, FILE_READ_ACTION_NAMES)) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  if (
    normalizedName.includes("read_file") ||
    normalizedName.includes("list_files")
  ) {
    return <FiFileText size={12} className="min-w-4" />;
  }
  return null;
}

export function resolveActionRailIcon({
  name,
  args,
  result,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
}): ReactNode {
  const normalizedName = (normalizeToolName(name) ?? name).toLowerCase();
  const operationIcon = resolveActionIconFromOperation(
    resolveActionOperation(args),
  );
  if (operationIcon) {
    return operationIcon;
  }
  if (isDeletedFileChange(normalizedName, args, result)) {
    return <FiTrash2 size={13} className="min-w-4" />;
  }
  return (
    resolveActionIconFromToolName(normalizedName) ?? (
      <PiWrenchFill size={13} className="min-w-4" />
    )
  );
}

export function resolveToolResultDisplay(
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
    const summaryText = resolveCompactionSummaryEntryText({
      entry,
      toolResultsById,
      toolCallArguments,
    });
    if (summaryText) {
      return summaryText;
    }
  }
  return null;
}

export function resolveCompactionSummaryEntryText(args: {
  entry: ToolCallRenderEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string | null {
  const toolResult = args.toolResultsById[args.entry.toolCall.id];
  const resultDisplay = resolveToolResultDisplay(formatToolResult(toolResult));
  if (resultDisplay) {
    return resultDisplay;
  }
  const argsFromMessage = args.entry.toolCall.function?.arguments;
  if (isRecord(argsFromMessage) && Object.keys(argsFromMessage).length > 0) {
    return formatToolArgs(argsFromMessage);
  }
  const pendingArgs = args.toolCallArguments[args.entry.toolCall.id];
  if (pendingArgs && pendingArgs.trim().length > 0) {
    return pendingArgs;
  }
  return null;
}

export function resolveActionEntryLabel(
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

export function resolveToolEntryLabel(
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

export function resolveSubagentEntryLabel({
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
  if (argsFromResult && Object.keys(argsFromResult).length > 0) {
    return argsFromResult;
  }
  return resolveToolCallArguments(toolCall, toolCallArguments);
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

export function resolveLatestThoughtPreview(
  timelineEntries: ActivityTimelineEntry[],
): { thoughtActivityKey: string | null; thoughtText: string | null } {
  for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
    const entry = timelineEntries[index];
    if (!entry || entry.kind !== "thinking") {
      continue;
    }
    const thoughtText = entry.thinkingEntry.item.thinking.trim();
    if (thoughtText.length > 0) {
      return {
        thoughtActivityKey: entry.key,
        thoughtText,
      };
    }
  }
  return {
    thoughtActivityKey: null,
    thoughtText: null,
  };
}

export function resolveHasStreamingThought(
  timelineEntries: ActivityTimelineEntry[],
): boolean {
  return timelineEntries.some(
    (entry) => entry.kind === "thinking" && entry.thinkingEntry.isStreaming,
  );
}

export function resolveThinkingPreviewHeadline(entry: ThinkingRenderEntry): {
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

export function resolveFallbackThinkingHeadline(
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

export type ActivityPreviewBase = Pick<
  ActivityPreviewData,
  "thoughtText" | "thoughtActivityKey" | "hasStreamingThought"
>;

export function buildActivityPreviewData(
  base: ActivityPreviewBase,
  label: string,
  kind: ActivityPreviewData["kind"],
  shouldScrambleTitle = false,
): ActivityPreviewData {
  return {
    label,
    kind,
    ...base,
    shouldScrambleTitle,
  };
}
