import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";

import { ReactNode, memo } from "react";

import { FaBrain } from "react-icons/fa6";

import { FiArchive, FiCpu } from "react-icons/fi";

import { MdErrorOutline } from "react-icons/md";

import { PiWrenchFill } from "react-icons/pi";

import { C } from "utils/c";

import {
  normalizeToolName,
  parseApprovalPayload,
  parseAskUserQuestionPayload,
} from "utils/claudeTools";

import {
  ChatRoleEnum,
  ToolCall,
  ToolChatMessage,
  ToolNameNormalizationConfig,
} from "utils/generatedTypes";

import { ApprovalCard } from "../ApprovalCard";

import { QuestionCard } from "../QuestionCard";

import {
  resolveStructuredOutputFallbackPayload,
  resolveStructuredOutputPayload,
} from "../chatStructuredOutput";

import { parseIsoTimestampMs } from "../chatTiming";

import {
  ASSISTANT_ERROR_MARKDOWN_CLASS,
  ASSISTANT_MARKDOWN_CLASS,
  ActivityTimelineEntry,
  AssistantChatMessage,
  CHAT_BUBBLE_MAX_WIDTH_CLASS,
  ChatContentItem,
  ToolCallRenderEntry,
  ToolResultValue,
} from "./modelAndAttachmentPreview";

import {
  MarkdownContent,
  copyTextWithNotifications,
  extractNonEmptyStringArg,
  resolveActionRailIcon,
  resolveCompactionEntryLabel,
  resolveDisplayArgsForToolCallEntry,
} from "./streamingMarkdownAndToolLabels";

import {
  ChatImage,
  isAssistantErrorText,
  stripAssistantErrorPrefix,
} from "./activityPreviewsAndAttachmentDialog";

import {
  ThinkingBox,
  resolveThinkingRowRunState,
  resolveThinkingSectionState,
} from "./attachmentListAndThinkingState";

import {
  ActionItem,
  ActivityToolLikeItem,
  TerminalItem,
  ToolCallItem,
} from "./structuredOutputAndToolItems";

import { buildCopyTextForActivityTimelineEntry } from "./messageActionsAndStaticBodies";

import { resolveQuestionAnswers } from "./assistantRenderingAndEditing";

import { formatToolResult } from "./messageListAndFormatting";

export const SubagentItem = memo(function SubagentItem({
  name,
  toolCallId,
  args,
  result,
  runState,
  startedAtMs,
  completedAtMs,
  runKey,
  onCopy,
  defaultOpen = false,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onExpansionChange,
}: {
  name: string;
  toolCallId: string;
  args: unknown;
  result: ToolResultValue | undefined;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  runKey: string;
  onCopy?: () => void;
  defaultOpen?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onExpansionChange?: (activityKey: string, isExpanded: boolean) => void;
}) {
  const inputPayload = resolveStructuredOutputPayload({
    value: args,
    toolName: name,
    part: "input",
  });
  const resultPayload =
    resolveStructuredOutputPayload({
      value: result,
      toolName: name,
      part: "output",
      contextValue: args,
    }) ??
    resolveStructuredOutputFallbackPayload({
      runState,
      failedLabel: "Subagent failed",
      successLabel: "Subagent completed successfully",
      stoppedLabel: "Subagent stopped before completion.",
    });
  const profileId = extractNonEmptyStringArg(args, "profileId");
  const label =
    profileId || normalizeToolName(name) || `Subagent ${toolCallId}`;

  return (
    <ActivityToolLikeItem
      rowKind="subagent"
      label={label}
      inputTitle="Subagent details"
      outputTitle="Self-talk"
      inputPayload={inputPayload}
      resultPayload={resultPayload}
      runState={runState}
      startedAtMs={startedAtMs}
      completedAtMs={completedAtMs}
      runKey={runKey}
      railIcon={<FiCpu size={13} className="min-w-4" />}
      onCopy={onCopy}
      defaultOpen={defaultOpen}
      expandAllSignal={expandAllSignal}
      collapseAllSignal={collapseAllSignal}
      onExpansionChange={onExpansionChange}
    />
  );
});

export type AssistantActionSectionProps = {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  showItemCopyButtons?: boolean;
  defaultChildrenOpen?: boolean;
  openAllSignal?: number;
  closeAllSignal?: number;
  suppressCollapsedSummary?: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
};

export type AssistantActionRowProps = {
  entry: ActivityTimelineEntry;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  showItemCopyButtons: boolean;
  defaultChildrenOpen: boolean;
  openAllSignal: number;
  closeAllSignal: number;
  suppressCollapsedSummary: boolean;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
};

export type AssistantToolActivityContext = {
  entry: Exclude<ActivityTimelineEntry, { kind: "thinking" }>;
  toolCall: ToolCall;
  toolEntry: ToolCallRenderEntry;
  toolResult: ToolChatMessage | undefined;
  rawToolName: string;
  runState: ToolCallRunState;
  startedAtMs: number | null;
  completedAtMs: number | null;
  formattedToolResult: ToolResultValue | undefined;
  argsToDisplay: unknown;
  normalizedToolName: string | null;
};

export function createActivityRowCopyHandler(text: string): () => void {
  return () => {
    copyTextWithNotifications({
      text,
      emptyMessage: "Nothing to copy for this activity item.",
      successMessage: "Copied activity item.",
      failureMessage: "Failed to copy activity item.",
    });
  };
}

export function resolveAssistantToolActivityContext({
  entry,
  toolResultsById,
  toolCallArguments,
}: Pick<
  AssistantActionRowProps,
  "entry" | "toolResultsById" | "toolCallArguments"
>): AssistantToolActivityContext {
  const toolEntry = entry.toolEntry;
  const toolCall = toolEntry.toolCall;
  const toolResult = toolResultsById[toolCall.id];
  return {
    entry,
    toolCall,
    toolEntry,
    toolResult,
    rawToolName:
      toolResult?.tool_name ||
      toolCall.function?.name ||
      `Tool call ${toolCall.id}`,
    runState: resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      toolEntry.isStreaming,
    ),
    ...resolveToolResultTimingAnchors(toolResult),
    formattedToolResult: formatToolResult(toolResult),
    argsToDisplay: resolveDisplayArgsForToolCallEntry({
      toolCall,
      toolResult,
      toolCallArguments,
    }),
    normalizedToolName: normalizeToolName(toolCall.function?.name),
  };
}

export function wrapAssistantActivityCard(
  key: string,
  child: ReactNode,
): ReactNode {
  return (
    <div
      key={key}
      className="border-b border-setta-200/60 last:border-b-0 dark:border-setta-700/60"
    >
      {child}
    </div>
  );
}

export function resolveAssistantInteractiveActivityCard(
  context: AssistantToolActivityContext,
): ReactNode | null {
  if (
    context.normalizedToolName === ToolNameNormalizationConfig.approvalToolName
  ) {
    const approvalPayload = parseApprovalPayload(context.argsToDisplay);
    if (!approvalPayload) {
      return null;
    }
    const approvalToolName = normalizeToolName(approvalPayload.toolName);
    if (
      approvalToolName === ToolNameNormalizationConfig.askUserQuestionToolName
    ) {
      const questionPayload = parseAskUserQuestionPayload(
        approvalPayload.input,
      );
      if (questionPayload) {
        return wrapAssistantActivityCard(
          context.entry.key,
          <QuestionCard
            toolCallId={context.toolCall.id}
            payload={questionPayload}
            resolvedAnswers={resolveQuestionAnswers(
              questionPayload,
              context.toolResult,
            )}
          />,
        );
      }
    }
    return wrapAssistantActivityCard(
      context.entry.key,
      <ApprovalCard
        toolCallId={context.toolCall.id}
        toolName={approvalPayload.toolName ?? null}
        toolType={approvalPayload.toolType ?? null}
        input={approvalPayload.input}
        toolResult={context.toolResult}
        isStreaming={context.toolEntry.isStreaming}
      />,
    );
  }
  if (
    context.normalizedToolName !==
    ToolNameNormalizationConfig.askUserQuestionToolName
  ) {
    return null;
  }
  const questionPayload = parseAskUserQuestionPayload(context.argsToDisplay);
  if (!questionPayload) {
    return null;
  }
  return wrapAssistantActivityCard(
    context.entry.key,
    <QuestionCard
      toolCallId={context.toolCall.id}
      payload={questionPayload}
      resolvedAnswers={resolveQuestionAnswers(
        questionPayload,
        context.toolResult,
      )}
    />,
  );
}

export function renderAssistantToolActivityRow({
  context,
  toolResultsById,
  toolCallArguments,
  onCopyRow,
  defaultChildrenOpen,
  openAllSignal,
  closeAllSignal,
  onThinkingOpenStateChange,
}: {
  context: AssistantToolActivityContext;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  onCopyRow?: () => void;
  defaultChildrenOpen: boolean;
  openAllSignal: number;
  closeAllSignal: number;
  onThinkingOpenStateChange?: (
    activityKey: string,
    isExpanded: boolean,
  ) => void;
}): ReactNode {
  const sharedProps = {
    key: context.entry.key,
    args: context.argsToDisplay,
    runState: context.runState,
    startedAtMs: context.startedAtMs,
    completedAtMs: context.completedAtMs,
    runKey: `activity-item-${context.toolCall.id}`,
    onCopy: onCopyRow,
    defaultOpen: defaultChildrenOpen,
    expandAllSignal: openAllSignal,
    collapseAllSignal: closeAllSignal,
    onExpansionChange: onThinkingOpenStateChange,
  };
  if (context.entry.kind === "action") {
    return (
      <ActionItem
        {...sharedProps}
        name={context.rawToolName}
        result={context.formattedToolResult}
        railIcon={resolveActionRailIcon({
          name: context.rawToolName,
          args: context.argsToDisplay,
          result: context.formattedToolResult,
        })}
      />
    );
  }
  if (context.entry.kind === "terminal") {
    return (
      <TerminalItem
        {...sharedProps}
        name={context.rawToolName}
        result={context.formattedToolResult}
      />
    );
  }
  if (context.entry.kind === "subagent") {
    return (
      <SubagentItem
        {...sharedProps}
        name={context.rawToolName}
        toolCallId={context.toolCall.id}
        result={context.formattedToolResult}
      />
    );
  }
  if (context.entry.kind === "compaction") {
    return (
      <ToolCallItem
        {...sharedProps}
        name="Context compaction"
        result={resolveCompactionEntryLabel({
          entry: context.toolEntry,
          toolResultsById,
          toolCallArguments,
        })}
        railIcon={<FiArchive className="min-w-4" size={14} />}
      />
    );
  }
  return (
    <ToolCallItem
      {...sharedProps}
      name={context.rawToolName}
      result={context.formattedToolResult}
      railIcon={<PiWrenchFill size={13} className="min-w-4" />}
    />
  );
}

export const AssistantActionRow = memo(function AssistantActionRow({
  entry,
  toolResultsById,
  toolCallArguments,
  showItemCopyButtons,
  defaultChildrenOpen,
  openAllSignal,
  closeAllSignal,
  suppressCollapsedSummary,
  onThinkingOpenStateChange,
}: AssistantActionRowProps) {
  const onCopyRow = showItemCopyButtons
    ? createActivityRowCopyHandler(
        buildCopyTextForActivityTimelineEntry({
          entry,
          toolResultsById,
          toolCallArguments,
        }),
      )
    : undefined;
  if (entry.kind === "thinking") {
    return (
      <ThinkingBox
        key={entry.key}
        activityKey={entry.key}
        content={entry.thinkingEntry.item.thinking}
        summary={entry.thinkingEntry.item.summary}
        timestampMs={entry.thinkingEntry.timestampMs}
        isStreaming={entry.thinkingEntry.isStreaming}
        wasInterrupted={entry.thinkingEntry.wasInterrupted}
        runKey={`activity-${entry.thinkingEntry.timerRunKey}`}
        railIcon={<FaBrain size={13} className="min-w-4" />}
        onCopy={onCopyRow}
        defaultOpen={defaultChildrenOpen}
        expandAllSignal={openAllSignal}
        collapseAllSignal={closeAllSignal}
        suppressCollapsedSummary={suppressCollapsedSummary}
        onExpansionChange={onThinkingOpenStateChange}
      />
    );
  }
  const context = resolveAssistantToolActivityContext({
    entry,
    toolResultsById,
    toolCallArguments,
  });
  return (
    resolveAssistantInteractiveActivityCard(context) ??
    renderAssistantToolActivityRow({
      context,
      toolResultsById,
      toolCallArguments,
      onCopyRow,
      defaultChildrenOpen,
      openAllSignal,
      closeAllSignal,
      onThinkingOpenStateChange,
    })
  );
});

export const AssistantActionSection = memo(function AssistantActionSection({
  timelineEntries,
  toolResultsById,
  toolCallArguments,
  showItemCopyButtons = true,
  defaultChildrenOpen = false,
  openAllSignal = 0,
  closeAllSignal = 0,
  suppressCollapsedSummary = false,
  onThinkingOpenStateChange,
}: AssistantActionSectionProps) {
  return (
    <div
      data-chat-assistant-activity-items="true"
      className="flex w-full flex-col"
    >
      {timelineEntries.map((entry) => (
        <AssistantActionRow
          key={entry.key}
          entry={entry}
          toolResultsById={toolResultsById}
          toolCallArguments={toolCallArguments}
          showItemCopyButtons={showItemCopyButtons}
          defaultChildrenOpen={defaultChildrenOpen}
          openAllSignal={openAllSignal}
          closeAllSignal={closeAllSignal}
          suppressCollapsedSummary={suppressCollapsedSummary}
          onThinkingOpenStateChange={onThinkingOpenStateChange}
        />
      ))}
    </div>
  );
});

export type ToolCallRunState = "running" | "success" | "failed" | "stopped";

export type ToolCallSectionState = "running" | "complete" | "stopped";

export function resolveToolCallRunState(
  success: boolean | undefined,
  isStreaming: boolean,
): ToolCallRunState {
  if (success === true) {
    return "success";
  }
  if (success === false) {
    return "failed";
  }
  if (isStreaming) {
    return "running";
  }
  return "stopped";
}

export function resolveToolCallSectionState(
  states: ToolCallRunState[],
): ToolCallSectionState {
  if (states.some((state) => state === "failed" || state === "stopped")) {
    return "stopped";
  }
  if (states.some((state) => state === "running")) {
    return "running";
  }
  return "complete";
}

export function hasPendingInteractiveToolCall(
  toolCalls: ToolCall[] | null | undefined,
  toolResultsById: Record<string, ToolChatMessage>,
): boolean {
  if (!toolCalls || toolCalls.length === 0) {
    return false;
  }
  return toolCalls.some((toolCall) => {
    const normalizedName = normalizeToolName(toolCall.function?.name);
    if (
      normalizedName !== ToolNameNormalizationConfig.approvalToolName &&
      normalizedName !== ToolNameNormalizationConfig.askUserQuestionToolName
    ) {
      return false;
    }
    return !toolResultsById[toolCall.id];
  });
}

export function hasPendingInteractiveToolCallsInMessages(
  messages: AssistantChatMessage[],
  toolResultsById: Record<string, ToolChatMessage>,
): boolean {
  return messages.some((message) =>
    hasPendingInteractiveToolCall(message.tool_calls ?? null, toolResultsById),
  );
}

export type ToolSectionTimingAnchors = {
  startedAtMs: number | null;
  completedAtMs: number | null;
};

export type ResolvedActivityEntryTiming = ToolSectionTimingAnchors & {
  runState: ToolCallRunState;
};

export function resolveToolResultTimingAnchors(
  toolResult: ToolChatMessage | undefined,
): ToolSectionTimingAnchors {
  return {
    startedAtMs: parseIsoTimestampMs(toolResult?.started_at),
    completedAtMs: parseIsoTimestampMs(toolResult?.completed_at),
  };
}

export function mergeToolSectionTimingAnchor(
  currentValue: number | null,
  nextValue: number | null,
  merge: (left: number, right: number) => number,
): number | null {
  if (nextValue === null) {
    return currentValue;
  }
  return currentValue === null ? nextValue : merge(currentValue, nextValue);
}

export function resolveActivityTimelineEntryTiming(
  entry: ActivityTimelineEntry,
  toolResultsById: Record<string, ToolChatMessage>,
): ResolvedActivityEntryTiming {
  if (entry.kind === "thinking") {
    return {
      runState: resolveThinkingRowRunState(
        resolveThinkingSectionState({
          isStreaming: entry.thinkingEntry.isStreaming,
          wasInterrupted: entry.thinkingEntry.wasInterrupted,
        }),
      ),
      startedAtMs: null,
      completedAtMs: null,
    };
  }

  const toolResult = toolResultsById[entry.toolEntry.toolCall.id];
  return {
    runState: resolveToolCallRunState(
      toolResult ? !toolResult.is_error : undefined,
      entry.toolEntry.isStreaming,
    ),
    ...resolveToolResultTimingAnchors(toolResult),
  };
}

export function resolveActivitySectionTiming({
  timelineEntries,
  toolResultsById,
}: {
  timelineEntries: ActivityTimelineEntry[];
  toolResultsById: Record<string, ToolChatMessage>;
}): {
  sectionState: ToolCallSectionState;
  startedAtMs: number | null;
  completedAtMs: number | null;
} {
  const runStates: ToolCallRunState[] = [];
  let startedAtMs: number | null = null;
  let completedAtMs: number | null = null;
  for (const entry of timelineEntries) {
    const {
      runState,
      startedAtMs: entryStartedAtMs,
      completedAtMs: entryCompletedAtMs,
    } = resolveActivityTimelineEntryTiming(entry, toolResultsById);
    runStates.push(runState);
    startedAtMs = mergeToolSectionTimingAnchor(
      startedAtMs,
      entryStartedAtMs,
      Math.min,
    );
    completedAtMs = mergeToolSectionTimingAnchor(
      completedAtMs,
      entryCompletedAtMs,
      Math.max,
    );
  }
  return {
    sectionState: resolveToolCallSectionState(runStates),
    startedAtMs,
    completedAtMs,
  };
}

export function AssistantErrorCallout({
  content,
  conversationSearchTerms = [],
}: {
  content: string;
  conversationSearchTerms?: Array<string>;
}) {
  const displayText = stripAssistantErrorPrefix(content);
  return (
    <div
      className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-50"
      data-chat-assistant-error="true"
    >
      <MdErrorOutline className="mt-0.5 shrink-0 text-red-500 dark:text-red-400" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
          AI request failed
        </div>
        <MarkdownContent
          content={displayText}
          className={ASSISTANT_ERROR_MARKDOWN_CLASS}
          role={ChatRoleEnum.assistant}
          isStreaming={false}
          highlightTerms={conversationSearchTerms}
        />
      </div>
    </div>
  );
}

export function StreamItem({
  item,
  isStreaming,
  runKey,
  conversationSearchTerms = [],
}: {
  item: ChatContentItem;
  isStreaming: boolean;
  runKey: string;
  conversationSearchTerms?: Array<string>;
}) {
  switch (item.type) {
    case C.LLM_TEXT:
      if (isAssistantErrorText(item.text)) {
        return (
          <AssistantErrorCallout
            content={item.text}
            conversationSearchTerms={conversationSearchTerms}
          />
        );
      }
      return (
        <MarkdownContent
          content={item.text}
          className={ASSISTANT_MARKDOWN_CLASS}
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
          highlightTerms={conversationSearchTerms}
        />
      );
    case C.LLM_THINKING:
      return (
        <ThinkingBox
          activityKey={runKey}
          content={item.thinking}
          summary={item.summary}
          timestampMs={null}
          isStreaming={isStreaming}
          wasInterrupted={false}
          runKey={runKey}
          conversationSearchTerms={conversationSearchTerms}
        />
      );
    case "image_url":
      return <ChatImage url={item.image_url.url} />;
    default:
      return null;
  }
}

export function AssistantReasoningCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full" data-chat-assistant-reasoning-card="true">
      {children}
    </div>
  );
}

export function AssistantActivityActionsAnchor({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className="group relative mt-4 w-full"
      data-chat-assistant-activity-anchor="true"
    >
      {children}
      {actions ? (
        <div
          className="absolute left-full top-1/2 z-[20] ml-1.5 -translate-y-1/2"
          data-chat-actions-anchor="right"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantToolCallCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full" data-chat-assistant-tool-call-card="true">
      {children}
    </div>
  );
}

export function AssistantTypingIndicator({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className="w-full px-1.5 text-setta-400 dark:text-setta-500"
      data-chat-assistant-typing-indicator="true"
      aria-hidden="true"
    >
      <BrailleSpinner
        className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} text-setta-400 dark:text-setta-300/70`}
      />
    </div>
  );
}

export function AssistantMessageGroup({
  children,
  messageId,
  actions,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  messageId?: string;
  actions?: ReactNode;
  isSearchMatchActive?: boolean;
}) {
  const widthClass = `group flex w-full ${CHAT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-start gap-2`;
  const containerClassName = isSearchMatchActive
    ? "mb-2 mt-1.5 flex justify-start rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "mb-2 mt-1.5 flex justify-start @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div className={`${widthClass} relative`} data-message-id={messageId}>
        {children}
        {actions ? (
          <div
            className="absolute left-full top-1/2 z-[20] ml-1.5 -translate-y-1/2"
            data-chat-actions-anchor="right"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LLMChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex max-w-full">
      <div
        className="relative inline-flex min-h-[24px] min-w-[24px] max-w-full cursor-text flex-col gap-1.5 rounded-b-lg rounded-tr-lg border border-transparent bg-white pb-2 pl-3 pr-2.5 pt-1 text-setta-800 dark:border-setta-700/45 dark:bg-setta-850 dark:text-setta-50"
        data-chat-assistant-bubble="true"
      >
        {children}
      </div>
    </div>
  );
}

export function UserChatBubble({
  children,
  actions,
  footer,
  messageId,
  bubbleWidthPx,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  messageId?: string;
  bubbleWidthPx?: number | null;
  isSearchMatchActive?: boolean;
}) {
  const containerClassName = isSearchMatchActive
    ? "my-2 flex justify-end rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "my-2 flex justify-end @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div
        className={`group flex w-fit ${CHAT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-end`}
        data-message-id={messageId}
      >
        <div
          className="relative inline-flex max-w-full cursor-text flex-col gap-1.5 rounded-t-lg rounded-bl-lg border border-blue-300 bg-blue-200 pb-2 pl-3 pr-2.5 pt-1 text-setta-950 dark:border-blue-800/80 dark:bg-blue-950 dark:text-white"
          data-chat-user-bubble="true"
          style={
            typeof bubbleWidthPx === "number"
              ? { width: `${bubbleWidthPx}px` }
              : undefined
          }
        >
          {children}
          {actions ? (
            <div
              className="absolute right-full top-1/2 z-[20] mr-1.5 -translate-y-1/2"
              data-chat-actions-anchor="left"
            >
              {actions}
            </div>
          ) : null}
        </div>
        {footer}
      </div>
    </div>
  );
}
