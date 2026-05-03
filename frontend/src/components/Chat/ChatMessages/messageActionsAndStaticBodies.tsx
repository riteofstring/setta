import { ReactNode, useCallback, useMemo } from "react";

import { FiCopy, FiEdit3, FiRotateCcw } from "react-icons/fi";

import { MdChevronLeft, MdChevronRight } from "react-icons/md";

import type { ChatMessageBranchInfo } from "state/actions/aiBranches";

import { C } from "utils/c";

import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolCall,
  ToolChatMessage,
} from "utils/generatedTypes";

import { ChatMessageEditor } from "../ChatMessageEditor";

import { ChatMessageTimestampFooter } from "../chatTiming";

import { type AttachmentUrlEntry } from "../useChatMessageAttachmentUrls";

import {
  ActivityPreviewData,
  ActivityTimelineEntry,
  AssistantChatMessage,
  AssistantDisplayItem,
  CHAT_MARKDOWN_BASE_CLASS,
  EMPTY_ASSISTANT_CONTENT,
  IDLE_SPINNER_DELAY_MS,
  NonAssistantChatMessage,
} from "./modelAndAttachmentPreview";

import {
  MarkdownContent,
  buildActivityTimelineEntries,
  copyTextWithNotifications,
  formatToolArgs,
  resolveDisplayArgsForToolCallEntry,
} from "./streamingMarkdownAndToolLabels";

import {
  ChatImage,
  getStreamActivitySummary,
  hasMeaningfulAssistantDisplayItems,
  isThinkingContentItem,
  partitionAssistantContent,
  resolveLatestActivityPreview,
  useIdleStreamSpinner,
} from "./activityPreviewsAndAttachmentDialog";

import { ChatAttachmentList } from "./attachmentListAndThinkingState";

import {
  ToolCallSectionState,
  UserChatBubble,
  hasPendingInteractiveToolCall,
  resolveActivitySectionTiming,
} from "./activityRowsAndBubbles";

import { formatToolResult } from "./messageListAndFormatting";

export function SystemChatBubble({
  children,
  actions,
  footer,
  messageId,
  isSearchMatchActive = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  messageId?: string;
  isSearchMatchActive?: boolean;
}) {
  const containerClassName = isSearchMatchActive
    ? "my-2 flex justify-center rounded-md ring-1 ring-blue-400/70 [&_mark[data-chat-search-highlight=true]]:bg-amber-300/90 dark:ring-blue-500/70 dark:[&_mark[data-chat-search-highlight=true]]:bg-amber-400/35 @container/chat-message"
    : "my-2 flex justify-center @container/chat-message";
  return (
    <div
      className={containerClassName}
      data-chat-search-active-match={isSearchMatchActive ? "true" : "false"}
    >
      <div
        className="group flex max-w-[min(90%,800px)] flex-col items-start"
        data-message-id={messageId}
      >
        <div
          className="relative flex max-w-full cursor-text flex-col gap-1.5 rounded-md border border-setta-200 bg-setta-50 px-2.5 pb-1.5 pt-0.5 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300"
          data-chat-system-bubble="true"
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
        {footer}
      </div>
    </div>
  );
}

export const USER_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;

export const SYSTEM_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

export function ChatMessageBranchNavigator({
  branchInfo,
  onBranchSwitch,
}: {
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  const branchCount = branchInfo?.branchChatIds.length ?? 0;
  const activeIndex = branchInfo?.activeIndex ?? 0;
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < branchCount - 1;
  if (branchCount <= 1 || !branchInfo || !onBranchSwitch) {
    return null;
  }
  const goToBranch = (index: number) => {
    const nextId = branchInfo.branchChatIds[index];
    if (nextId) {
      onBranchSwitch(nextId);
    }
  };
  return (
    <div className="ml-0.5 inline-flex items-center gap-0.5 rounded-sm border border-setta-200 px-0.5 py-0.5 text-[9px] font-medium tabular-nums text-setta-500 dark:border-setta-700 dark:text-setta-300">
      <button
        type="button"
        aria-label="Previous branch"
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
        onClick={() => goToBranch(activeIndex - 1)}
        disabled={!canGoPrevious}
      >
        <MdChevronLeft />
      </button>
      <span className="min-w-[30px] px-1 text-center">
        {activeIndex + 1}/{branchCount}
      </span>
      <button
        type="button"
        aria-label="Next branch"
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
        onClick={() => goToBranch(activeIndex + 1)}
        disabled={!canGoNext}
      >
        <MdChevronRight />
      </button>
    </div>
  );
}

export function ChatMessageActions({
  onCopy,
  onRedo,
  showRedo,
  redoDisabled,
  redoDisabledReason,
  showEdit,
  editDisabled,
  editDisabledReason,
  onEdit,
  branchInfo,
  onBranchSwitch,
}: {
  onCopy: () => void;
  onRedo?: () => void;
  showRedo: boolean;
  redoDisabled: boolean;
  redoDisabledReason: string | null;
  showEdit: boolean;
  editDisabled: boolean;
  editDisabledReason: string | null;
  onEdit?: (bubbleWidthPx?: number) => void;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  return (
    <div
      className="pointer-events-none relative z-[1] inline-flex flex-col items-center gap-1 rounded-md border border-setta-200/90 bg-setta-100/95 px-1 py-0.5 text-setta-500 opacity-0 shadow-sm transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 @[40rem]/chat-message:flex-row dark:border-setta-700/90 dark:bg-setta-925/95 dark:text-setta-300"
      data-chat-message-actions="true"
    >
      <button
        type="button"
        aria-label="Copy message"
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:hover:text-setta-100"
        onClick={onCopy}
      >
        <FiCopy />
      </button>
      {showRedo ? (
        <button
          type="button"
          aria-label="Redo response"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={() => onRedo?.()}
          disabled={redoDisabled}
          title={redoDisabledReason ?? undefined}
        >
          <FiRotateCcw />
        </button>
      ) : null}
      {showEdit ? (
        <button
          type="button"
          aria-label="Edit message"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={(event) => {
            const bubble = event.currentTarget.closest(
              '[data-chat-user-bubble="true"]',
            );
            const bubbleWidthPx = bubble
              ? bubble.getBoundingClientRect().width
              : undefined;
            onEdit?.(bubbleWidthPx);
          }}
          disabled={editDisabled}
          title={editDisabledReason ?? undefined}
        >
          <FiEdit3 />
        </button>
      ) : null}
      <ChatMessageBranchNavigator
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />
    </div>
  );
}

export function getPlainTextFromMessage(message: BaseChatMessageUnion): string {
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

export function resolveCopyToolCallArgs({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): unknown {
  return resolveDisplayArgsForToolCallEntry({
    toolCall,
    toolResult,
    toolCallArguments,
  });
}

export function resolveCopyToolCallResult(
  toolResult: ToolChatMessage | undefined,
): string | null {
  const result = formatToolResult(toolResult);
  if (typeof result === "string") {
    return result.trim().length > 0 ? result : null;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (result && typeof result === "object") {
    return formatToolArgs(result);
  }
  return null;
}

export function buildCopyTextForToolCall({
  toolCall,
  toolResult,
  toolCallArguments,
}: {
  toolCall: ToolCall;
  toolResult: ToolChatMessage | undefined;
  toolCallArguments: Record<string, string>;
}): string {
  const toolName =
    toolResult?.tool_name ||
    toolCall.function?.name ||
    `Tool call ${toolCall.id}`;
  const lines: string[] = [toolName];
  const args = resolveCopyToolCallArgs({
    toolCall,
    toolResult,
    toolCallArguments,
  });
  if (args) {
    lines.push(`Arguments:\n${formatToolArgs(args)}`);
  }
  const resultText = resolveCopyToolCallResult(toolResult);
  if (resultText) {
    lines.push(`Result:\n${resultText}`);
  }
  return lines.join("\n");
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
  for (const toolCall of message.tool_calls ?? []) {
    output.push(
      buildCopyTextForToolCall({
        toolCall,
        toolResult: toolResultsById[toolCall.id],
        toolCallArguments,
      }),
    );
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

export type ChatMessageProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive?: boolean;
  suppressActivityThoughtScroll?: boolean;
  suppressActivitySection?: boolean;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  isEditing?: boolean;
  editingBubbleWidthPx?: number | null;
  interrupted: boolean;
  activityAccordionOpenByDefault?: boolean;
  activityChildrenOpenByDefault?: boolean;
  conversationSearchTerms?: Array<string>;
  canEdit?: boolean;
  editDisabledReason?: string | null;
  onStartEdit?: (bubbleWidthPx?: number) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
};

export type ResolvedChatMessageProps = ChatMessageProps & {
  isSearchMatchActive: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  isEditing: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
  canEdit: boolean;
  editDisabledReason: string | null;
};

export const EMPTY_CONVERSATION_SEARCH_TERMS: Array<string> = [];

export const DEFAULT_CHAT_MESSAGE_OPTIONAL_PROPS: Pick<
  ResolvedChatMessageProps,
  | "isSearchMatchActive"
  | "suppressActivityThoughtScroll"
  | "suppressActivitySection"
  | "isEditing"
  | "activityAccordionOpenByDefault"
  | "activityChildrenOpenByDefault"
  | "conversationSearchTerms"
  | "canEdit"
  | "editDisabledReason"
> = {
  isSearchMatchActive: false,
  suppressActivityThoughtScroll: false,
  suppressActivitySection: false,
  isEditing: false,
  activityAccordionOpenByDefault: false,
  activityChildrenOpenByDefault: false,
  conversationSearchTerms: EMPTY_CONVERSATION_SEARCH_TERMS,
  canEdit: false,
  editDisabledReason: null,
};

export function resolveChatMessageProps(
  props: ChatMessageProps,
): ResolvedChatMessageProps {
  return {
    ...DEFAULT_CHAT_MESSAGE_OPTIONAL_PROPS,
    ...props,
  };
}

export type ChatMessageActionBarProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isEditing: boolean;
  isStreaming: boolean;
  canEdit: boolean;
  editDisabledReason: string | null;
  onStartEdit?: (bubbleWidthPx?: number) => void;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
};

export type AssistantMessageRenderState = {
  displayItems: AssistantDisplayItem[];
  hasMeaningfulDisplayItems: boolean;
  activityTimelineEntries: ActivityTimelineEntry[];
  activitySectionTiming: {
    sectionState: ToolCallSectionState;
    startedAtMs: number | null;
    completedAtMs: number | null;
  };
  showTypingIndicator: boolean;
  shouldRenderBubble: boolean;
  hasActivityContent: boolean;
  latestActivityPreview: ActivityPreviewData;
  autoExpandPendingInteraction: boolean;
  suppressThoughtScrollAnimation: boolean;
  hasThinkingActivity: boolean;
};

export type AssistantChatMessageBodyProps = {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  actionBar: ReactNode;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  interrupted: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
  messageTimestampMs: number | null;
};

export type StaticChatMessageBodyProps = {
  message: NonAssistantChatMessage;
  attachments: ChatFileAttachment[];
  actionBar: ReactNode;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  conversationSearchTerms: Array<string>;
  isSearchMatchActive: boolean;
  messageTimestampMs: number | null;
};

export type EditableUserChatMessageBodyProps = {
  message: BaseChatMessageUnion;
  attachments: ChatFileAttachment[];
  editingBubbleWidthPx?: number | null;
  canEdit: boolean;
  editDisabled: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
};

export function resolveMessageAttachments(
  message: BaseChatMessageUnion,
): ChatFileAttachment[] {
  return "attachments" in message && Array.isArray(message.attachments)
    ? message.attachments
    : [];
}

export function createRedoMessageHandler(
  messageId: string,
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean,
): (() => void) | undefined {
  if (!onRedoMessage) {
    return undefined;
  }
  return () => {
    void onRedoMessage(messageId);
  };
}

export function useChatMessageActionBar({
  message,
  toolResultsById,
  toolCallArguments,
  isEditing,
  isStreaming,
  canEdit,
  editDisabledReason,
  onStartEdit,
  onRedoMessage,
  branchInfo,
  onBranchSwitch,
}: ChatMessageActionBarProps): ReactNode {
  const handleCopy = useCallback(() => {
    const text = buildCopyTextForMessage({
      message,
      toolResultsById,
      toolCallArguments,
    });
    copyTextWithNotifications({
      text,
      emptyMessage: "Nothing to copy for this message.",
      successMessage: "Copied message.",
      failureMessage: "Failed to copy message.",
    });
  }, [message, toolCallArguments, toolResultsById]);
  const redoHandler = useMemo(
    () => createRedoMessageHandler(message.id, onRedoMessage),
    [message.id, onRedoMessage],
  );
  if (isEditing) {
    return null;
  }
  return (
    <ChatMessageActions
      onCopy={handleCopy}
      showRedo={
        message.role === ChatRoleEnum.assistant && redoHandler !== undefined
      }
      onRedo={redoHandler}
      redoDisabled={isStreaming}
      redoDisabledReason={isStreaming ? "Wait for response to finish." : null}
      showEdit={message.role === ChatRoleEnum.user && canEdit}
      editDisabled={Boolean(editDisabledReason)}
      editDisabledReason={editDisabledReason}
      onEdit={onStartEdit}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  );
}

export function renderStaticChatMessageContentItem({
  item,
  message,
  itemIndex,
  textClassName,
  imageClassName,
  conversationSearchTerms,
}: {
  item: NonAssistantChatMessage["content"][number];
  message: NonAssistantChatMessage;
  itemIndex: number;
  textClassName: string;
  imageClassName?: string;
  conversationSearchTerms: Array<string>;
}): ReactNode {
  const key = `${message.id}-${itemIndex}`;
  switch (item.type) {
    case C.LLM_TEXT:
      return (
        <MarkdownContent
          key={key}
          content={item.text}
          className={textClassName}
          role={message.role}
          isStreaming={false}
          highlightTerms={conversationSearchTerms}
        />
      );
    case C.LLM_THINKING:
      return (
        <MarkdownContent
          key={key}
          content={item.thinking}
          className={`${textClassName} italic`}
          role={message.role}
          isStreaming={false}
          highlightTerms={conversationSearchTerms}
        />
      );
    case "image_url":
      return (
        <ChatImage
          key={key}
          url={item.image_url.url}
          className={imageClassName}
        />
      );
    default:
      return null;
  }
}

export function EditableUserChatMessageBody({
  message,
  attachments,
  editingBubbleWidthPx,
  canEdit,
  editDisabled,
  onCancelEdit,
  onSaveEdit,
}: EditableUserChatMessageBodyProps) {
  return (
    <UserChatBubble messageId={message.id} bubbleWidthPx={editingBubbleWidthPx}>
      <ChatMessageEditor
        initialText={getPlainTextFromMessage(message)}
        initialAttachments={attachments}
        disabled={!canEdit || editDisabled}
        onCancel={onCancelEdit ?? (() => {})}
        onSave={onSaveEdit ?? (() => false)}
      />
    </UserChatBubble>
  );
}

export function StaticChatMessageBody({
  message,
  attachments,
  actionBar,
  attachmentUrlMap,
  requestAttachmentUrls,
  conversationSearchTerms,
  isSearchMatchActive,
  messageTimestampMs,
}: StaticChatMessageBodyProps) {
  const isSystem = message.role === ChatRoleEnum.system;
  const textClassName = isSystem ? SYSTEM_MARKDOWN_CLASS : USER_MARKDOWN_CLASS;
  const imageClassName = isSystem ? undefined : "border-white/30";
  const content = message.content ?? [];
  const bubbleContent = (
    <>
      <ChatAttachmentList
        attachments={attachments}
        isUser={!isSystem}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        conversationSearchTerms={conversationSearchTerms}
      />
      {content.map((item, itemIndex) =>
        renderStaticChatMessageContentItem({
          item,
          message,
          itemIndex,
          textClassName,
          imageClassName,
          conversationSearchTerms,
        }),
      )}
    </>
  );
  const footer = (
    <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
  );
  if (isSystem) {
    return (
      <SystemChatBubble
        messageId={message.id}
        actions={actionBar}
        footer={footer}
        isSearchMatchActive={isSearchMatchActive}
      >
        {bubbleContent}
      </SystemChatBubble>
    );
  }
  return (
    <UserChatBubble
      messageId={message.id}
      actions={actionBar}
      footer={footer}
      isSearchMatchActive={isSearchMatchActive}
    >
      {bubbleContent}
    </UserChatBubble>
  );
}

export function useAssistantMessageRenderState({
  message,
  attachments,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  interrupted,
}: {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  interrupted: boolean;
}): AssistantMessageRenderState {
  const assistantContent = message.content ?? EMPTY_ASSISTANT_CONTENT;
  const { activityKey } = useMemo(
    () => getStreamActivitySummary(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const { displayItems } = useMemo(
    () => partitionAssistantContent(assistantContent),
    [assistantContent],
  );
  const hasMeaningfulDisplayItems = useMemo(
    () => hasMeaningfulAssistantDisplayItems(displayItems),
    [displayItems],
  );
  const showTypingIndicator = useIdleStreamSpinner(
    isStreaming,
    activityKey,
    spinnerDelayMs,
  );
  const activityTimelineEntries = useMemo(
    () =>
      buildActivityTimelineEntries(
        [
          {
            message,
            isStreaming,
            wasInterrupted: interrupted,
          },
        ],
        toolResultsById,
      ),
    [interrupted, isStreaming, message, toolResultsById],
  );
  const activitySectionTiming = useMemo(
    () =>
      resolveActivitySectionTiming({
        timelineEntries: activityTimelineEntries,
        toolResultsById,
      }),
    [activityTimelineEntries, toolResultsById],
  );
  const latestActivityPreview = useMemo(
    () =>
      resolveLatestActivityPreview({
        timelineEntries: activityTimelineEntries,
        toolResultsById,
        toolCallArguments,
      }),
    [activityTimelineEntries, toolCallArguments, toolResultsById],
  );
  const hasThinkingActivity = useMemo(
    () => activityTimelineEntries.some((entry) => entry.kind === "thinking"),
    [activityTimelineEntries],
  );
  return {
    displayItems,
    hasMeaningfulDisplayItems,
    activityTimelineEntries,
    activitySectionTiming,
    showTypingIndicator,
    shouldRenderBubble: attachments.length > 0 || hasMeaningfulDisplayItems,
    hasActivityContent:
      !suppressActivitySection && activityTimelineEntries.length > 0,
    latestActivityPreview,
    autoExpandPendingInteraction: hasPendingInteractiveToolCall(
      message.tool_calls ?? null,
      toolResultsById,
    ),
    suppressThoughtScrollAnimation:
      suppressActivityThoughtScroll ||
      (isStreaming && hasMeaningfulDisplayItems),
    hasThinkingActivity,
  };
}
