import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import {
  memo,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiCopy, FiEdit3, FiRotateCcw } from "react-icons/fi";
import { MdChevronLeft, MdChevronRight, MdErrorOutline } from "react-icons/md";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { useAIStore } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";
import {
  type ActivityMessageContext,
  type ActivityTimelineEntry,
  buildActivityTimelineEntries,
  buildCopyTextForMessage,
  type ChatContentItem,
  getStreamActivitySummary,
  hasAssistantActivityContent,
  hasMeaningfulAssistantDisplayItems,
  isAssistantActivityOnlyMessage,
  isAssistantErrorText,
  partitionAssistantContent,
  resolveMessageCreatedAtMs,
  stripAssistantErrorPrefix,
} from "./chatAssistantActivity";
import {
  AssistantActivityCard,
  ThinkingBox,
} from "./chatAssistantActivityCard";
import { ChatAttachmentList, ChatImage } from "./chatAttachmentPreviews";
import {
  type ChatAttachmentUrlMap,
  type RequestChatAttachmentUrls,
  useChatAttachmentPreviewUrls,
} from "./chatAttachmentPreviewUrls";
import { copyTextWithNotifications } from "./chatCopyText";
import {
  ASSISTANT_MARKDOWN_CLASS,
  CHAT_MARKDOWN_BASE_CLASS,
  MarkdownContent,
  renderConversationSearchHighlightedText,
} from "./chatMessageContent";
import { ChatMessageEditor } from "./ChatMessageEditor";
import {
  ChatMessageTimestampFooter,
  useIdleStreamSpinner,
} from "./chatMessageRuntime";

export { buildCopyTextForMessage };

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;
const CHAT_BUBBLE_MAX_WIDTH_CLASS = "max-w-[min(90%,820px)]";
const ASSISTANT_BUBBLE_MAX_WIDTH_CLASS = CHAT_BUBBLE_MAX_WIDTH_CLASS;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;

type ChatMessageListProps = {
  messages: Array<BaseChatMessageUnion>;
  allMessagesForToolResults?: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments?: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  activeSearchMatchIndex?: number | null;
  conversationSearchTerms?: Array<string>;
  className?: string;
  contentClassName?: string;
  scrollRef?: Ref<HTMLDivElement>;
  editDisabledReason?: string | null;
  onConversationSearchMatchCountChange?: (count: number) => void;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfoByMessage?: Record<string, ChatMessageBranchInfo>;
};

function resolveStreamingAssistantMessageId(
  messages: Array<BaseChatMessageUnion>,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === ChatRoleEnum.assistant) {
      return message.id;
    }
  }
  return null;
}

function AssistantErrorCallout({
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

function StreamItem({
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

function AssistantTypingIndicator({ visible }: { visible: boolean }) {
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

function AssistantMessageGroup({
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
  const widthClass = `group flex w-full ${ASSISTANT_BUBBLE_MAX_WIDTH_CLASS} flex-col items-start gap-2`;
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

function LLMChatBubble({ children }: { children: ReactNode }) {
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

function UserChatBubble({
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

function SystemChatBubble({
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

const USER_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const SYSTEM_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

function ChatMessageActions({
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
  const branchCount = branchInfo?.branchChatIds.length ?? 0;
  const activeIndex = branchInfo?.activeIndex ?? 0;
  const hasBranches = branchCount > 1 && Boolean(onBranchSwitch);
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < branchCount - 1;

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
          onClick={() => {
            onRedo?.();
          }}
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
      {hasBranches ? (
        <div className="ml-0.5 inline-flex items-center gap-0.5 rounded-sm border border-setta-200 px-0.5 py-0.5 text-[9px] font-medium tabular-nums text-setta-500 dark:border-setta-700 dark:text-setta-300">
          <button
            type="button"
            aria-label="Previous branch"
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex - 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
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
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex + 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
            disabled={!canGoNext}
          >
            <MdChevronRight />
          </button>
        </div>
      ) : null}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive = false,
  suppressActivityThoughtScroll = false,
  suppressActivitySection = false,
  onRedoMessage,
  attachmentUrlMap,
  requestAttachmentUrls,
  isEditing = false,
  editingBubbleWidthPx,
  interrupted,
  activityAccordionOpenByDefault = false,
  activityChildrenOpenByDefault = false,
  conversationSearchTerms = [],
  canEdit = false,
  editDisabledReason = null,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  branchInfo,
  onBranchSwitch,
}: {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive?: boolean;
  suppressActivityThoughtScroll?: boolean;
  suppressActivitySection?: boolean;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  attachmentUrlMap: ChatAttachmentUrlMap;
  requestAttachmentUrls: RequestChatAttachmentUrls;
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
}) {
  const attachments =
    "attachments" in message && Array.isArray(message.attachments)
      ? message.attachments
      : [];
  const isUser = message.role === ChatRoleEnum.user;
  const isAssistant = message.role === ChatRoleEnum.assistant;
  const showEdit = isUser && canEdit;
  const editDisabled = Boolean(editDisabledReason);
  const renderAttachmentName = useCallback(
    (attachmentName: string) =>
      renderConversationSearchHighlightedText(
        attachmentName,
        conversationSearchTerms,
      ),
    [conversationSearchTerms],
  );
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
  const messageTimestampMs = resolveMessageCreatedAtMs(message);
  const actionBar = !isEditing ? (
    <ChatMessageActions
      onCopy={handleCopy}
      showRedo={isAssistant && Boolean(onRedoMessage)}
      onRedo={
        isAssistant && onRedoMessage
          ? () => {
              void onRedoMessage(message.id);
            }
          : undefined
      }
      redoDisabled={isStreaming}
      redoDisabledReason={isStreaming ? "Wait for response to finish." : null}
      showEdit={showEdit}
      editDisabled={editDisabled}
      editDisabledReason={editDisabledReason}
      onEdit={onStartEdit}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  ) : null;
  const assistantContent = isAssistant
    ? message.content
    : EMPTY_ASSISTANT_CONTENT;
  const { activityKey } = useMemo(
    () => getStreamActivitySummary(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const { displayItems } = useMemo(() => {
    if (!isAssistant) {
      return partitionAssistantContent(EMPTY_ASSISTANT_CONTENT);
    }
    return partitionAssistantContent(message.content);
  }, [isAssistant, message.content]);
  const hasMeaningfulDisplayItems = useMemo(
    () => hasMeaningfulAssistantDisplayItems(displayItems),
    [displayItems],
  );
  const showAssistantSpinner = useIdleStreamSpinner(
    isAssistant && isStreaming,
    activityKey,
    spinnerDelayMs,
  );
  const activityTimelineEntries = useMemo<ActivityTimelineEntry[]>(() => {
    if (!isAssistant) {
      return [];
    }
    return buildActivityTimelineEntries(
      [
        {
          message,
          isStreaming,
          wasInterrupted: interrupted,
        },
      ],
      toolResultsById,
    );
  }, [interrupted, isAssistant, isStreaming, message, toolResultsById]);

  if (message.role === ChatRoleEnum.assistant) {
    const showTypingIndicator = showAssistantSpinner;
    const hasBubbleContent =
      attachments.length > 0 || hasMeaningfulDisplayItems;
    const shouldRenderBubble = hasBubbleContent;
    const hasActivityContent =
      !suppressActivitySection && activityTimelineEntries.length > 0;
    if (!shouldRenderBubble && !hasActivityContent) {
      if (showTypingIndicator) {
        return (
          <AssistantMessageGroup messageId={message.id}>
            <AssistantTypingIndicator visible={true} />
          </AssistantMessageGroup>
        );
      }
      return null;
    }
    const hasThinkingActivity = activityTimelineEntries.some(
      (entry) => entry.kind === "thinking",
    );
    return (
      <AssistantMessageGroup
        messageId={message.id}
        actions={hasActivityContent ? undefined : actionBar}
        isSearchMatchActive={isSearchMatchActive}
      >
        {hasActivityContent ? (
          <AssistantActivityCard
            timelineEntries={activityTimelineEntries}
            toolResultsById={toolResultsById}
            toolCallArguments={toolCallArguments}
            runKey={`activity-${message.id}`}
            actionBar={actionBar}
            suppressThoughtScrollAnimation={
              suppressActivityThoughtScroll ||
              (isStreaming && hasMeaningfulDisplayItems)
            }
            defaultOpen={activityAccordionOpenByDefault}
            defaultChildrenOpen={activityChildrenOpenByDefault}
            conversationSearchTerms={conversationSearchTerms}
          />
        ) : null}
        {shouldRenderBubble ? (
          <LLMChatBubble>
            <ChatAttachmentList
              attachments={attachments}
              isUser={false}
              attachmentUrlMap={attachmentUrlMap}
              requestAttachmentUrls={requestAttachmentUrls}
              renderAttachmentName={renderAttachmentName}
            />
            {displayItems.map(({ item, fullIndex }) => {
              return (
                <StreamItem
                  key={fullIndex}
                  item={item}
                  isStreaming={isStreaming}
                  runKey={`${message.id}-content-${fullIndex}`}
                  conversationSearchTerms={conversationSearchTerms}
                />
              );
            })}
          </LLMChatBubble>
        ) : null}
        {shouldRenderBubble ? (
          <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
        ) : null}
        <AssistantTypingIndicator
          visible={
            showTypingIndicator &&
            !hasMeaningfulDisplayItems &&
            !hasThinkingActivity
          }
        />
        {!shouldRenderBubble && !hasActivityContent ? (
          <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
        ) : null}
      </AssistantMessageGroup>
    );
  }

  if (isUser && isEditing) {
    return (
      <UserChatBubble
        messageId={message.id}
        bubbleWidthPx={editingBubbleWidthPx}
      >
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

  const content = message.content ?? [];
  let textClassName = USER_MARKDOWN_CLASS;
  let imageClassName = "border-white/30";
  let Wrapper = UserChatBubble;
  if (message.role === ChatRoleEnum.system) {
    textClassName = SYSTEM_MARKDOWN_CLASS;
    imageClassName = "";
    Wrapper = SystemChatBubble;
  }
  const resolvedImageClassName = imageClassName || undefined;

  return (
    <Wrapper
      messageId={message.id}
      actions={actionBar}
      footer={<ChatMessageTimestampFooter timestampMs={messageTimestampMs} />}
      isSearchMatchActive={isSearchMatchActive}
    >
      <ChatAttachmentList
        attachments={attachments}
        isUser={message.role === ChatRoleEnum.user}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        renderAttachmentName={renderAttachmentName}
      />
      {content.map((item, idx) => {
        const key = `${message.id}-${idx}`;
        if (item.type === C.LLM_TEXT) {
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
        }
        if (item.type === C.LLM_THINKING) {
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
        }
        if (item.type === "image_url") {
          return (
            <ChatImage
              key={key}
              url={item.image_url.url}
              className={resolvedImageClassName}
            />
          );
        }
        return null;
      })}
    </Wrapper>
  );
});

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMessageId,
  conversationSearchTerms = [],
  allMessages,
  editDisabledReason,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIds?: Record<string, true>;
  activeSearchMessageId?: string | null;
  conversationSearchTerms?: Array<string>;
  allMessages: Array<BaseChatMessageUnion>;
  editDisabledReason?: string | null;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfoByMessage?: Record<string, ChatMessageBranchInfo>;
}) {
  const { canEditParams } = useShareCapabilities();
  const activityAccordionOpenByDefault = useAIStore(
    (state) => state.projectChatActivityAccordionOpenByDefault,
  );
  const activityChildrenOpenByDefault = useAIStore(
    (state) => state.projectChatActivityChildrenOpenByDefault,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBubbleWidthPx, setEditingBubbleWidthPx] = useState<
    number | null
  >(null);
  const { attachmentUrlMap, requestAttachmentUrls } =
    useChatAttachmentPreviewUrls(messages);
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );

  useEffect(() => {
    if (waitingForResponse) {
      setEditingMessageId(null);
      setEditingBubbleWidthPx(null);
    }
  }, [waitingForResponse]);
  const output: ReactNode[] = [];
  const lastMessage = messages[messages.length - 1];
  let streamingMessageId: string | null = null;
  if (waitingForResponse) {
    streamingMessageId = resolveStreamingAssistantMessageId(messages);
  }
  const suppressActivityThoughtScrollAnimation = useMemo(() => {
    if (!waitingForResponse || !streamingMessageId) {
      return false;
    }
    const streamingMessage = messages.find(
      (message) => message.id === streamingMessageId,
    );
    if (!streamingMessage || streamingMessage.role !== ChatRoleEnum.assistant) {
      return false;
    }
    const { displayItems } = partitionAssistantContent(
      streamingMessage.content,
    );
    return hasMeaningfulAssistantDisplayItems(displayItems);
  }, [messages, streamingMessageId, waitingForResponse]);
  const suppressedActivitySectionMessageIds = new Set<string>();
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (isAssistantActivityOnlyMessage(message)) {
      const groupedMessages: AssistantChatMessage[] = [];
      const activityMessageContexts: ActivityMessageContext[] = [];
      const firstMessageId = message.id;
      let groupEnd = index;
      while (groupEnd < messages.length) {
        const nextMessage = messages[groupEnd];
        if (!isAssistantActivityOnlyMessage(nextMessage)) {
          break;
        }
        groupedMessages.push(nextMessage);
        const isStreamingMessage =
          waitingForResponse && nextMessage.id === streamingMessageId;
        const wasInterrupted = Boolean(
          interruptedAssistantMessageIds?.[nextMessage.id],
        );
        activityMessageContexts.push({
          message: nextMessage,
          isStreaming: isStreamingMessage,
          wasInterrupted,
        });
        groupEnd += 1;
      }
      const trailingAssistantMessage = messages[groupEnd];
      if (
        trailingAssistantMessage?.role === ChatRoleEnum.assistant &&
        !isAssistantActivityOnlyMessage(trailingAssistantMessage) &&
        hasAssistantActivityContent(trailingAssistantMessage)
      ) {
        const isStreamingMessage =
          waitingForResponse &&
          trailingAssistantMessage.id === streamingMessageId;
        const wasInterrupted = Boolean(
          interruptedAssistantMessageIds?.[trailingAssistantMessage.id],
        );
        activityMessageContexts.push({
          message: trailingAssistantMessage,
          isStreaming: isStreamingMessage,
          wasInterrupted,
        });
        suppressedActivitySectionMessageIds.add(trailingAssistantMessage.id);
      }
      const timelineEntries = buildActivityTimelineEntries(
        activityMessageContexts,
        toolResultsById,
      );
      const hasActivityContent = timelineEntries.length > 0;
      const handleGroupedCopy = () => {
        const text = groupedMessages
          .map((groupedMessage) =>
            buildCopyTextForMessage({
              message: groupedMessage,
              toolResultsById,
              toolCallArguments,
            }),
          )
          .filter((entry) => entry.length > 0)
          .join("\n\n")
          .trim();
        copyTextWithNotifications({
          text,
          emptyMessage: "Nothing to copy for this message.",
          successMessage: "Copied message.",
          failureMessage: "Failed to copy message.",
        });
      };
      const actionBar = (
        <ChatMessageActions
          onCopy={handleGroupedCopy}
          showRedo={Boolean(onRedoMessage)}
          onRedo={
            onRedoMessage
              ? () => {
                  void onRedoMessage(firstMessageId);
                }
              : undefined
          }
          redoDisabled={waitingForResponse}
          redoDisabledReason={
            waitingForResponse ? "Wait for response to finish." : null
          }
          showEdit={false}
          editDisabled={false}
          editDisabledReason={null}
          branchInfo={branchInfoByMessage?.[firstMessageId]}
          onBranchSwitch={onBranchSwitch}
        />
      );
      output.push(
        <AssistantMessageGroup
          key={`tool-call-group-${firstMessageId}`}
          messageId={firstMessageId}
          isSearchMatchActive={firstMessageId === activeSearchMessageId}
        >
          {hasActivityContent ? (
            <AssistantActivityCard
              timelineEntries={timelineEntries}
              toolResultsById={toolResultsById}
              toolCallArguments={toolCallArguments}
              runKey={`activity-${firstMessageId}`}
              actionBar={actionBar}
              suppressThoughtScrollAnimation={
                suppressActivityThoughtScrollAnimation
              }
              defaultOpen={activityAccordionOpenByDefault}
              defaultChildrenOpen={activityChildrenOpenByDefault}
              conversationSearchTerms={conversationSearchTerms}
            />
          ) : null}
        </AssistantMessageGroup>,
      );
      index = groupEnd;
      continue;
    }
    const isStreamingMessage =
      waitingForResponse &&
      message.role === ChatRoleEnum.assistant &&
      message.id === streamingMessageId;
    const branchInfo = branchInfoByMessage?.[message.id];
    let resolvedEditDisabledReason: string | null = null;
    if (!canEditParams) {
      resolvedEditDisabledReason = "Editing disabled by share policy.";
    } else if (waitingForResponse) {
      resolvedEditDisabledReason = "Wait for response to finish.";
    } else if (editDisabledReason) {
      resolvedEditDisabledReason = editDisabledReason;
    }
    const canEdit = Boolean(onEditMessage);
    const isEditing = editingMessageId === message.id;
    output.push(
      <ChatMessage
        key={message.id}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={isStreamingMessage}
        isSearchMatchActive={message.id === activeSearchMessageId}
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          message.id,
        )}
        onRedoMessage={onRedoMessage}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        isEditing={isEditing}
        editingBubbleWidthPx={isEditing ? editingBubbleWidthPx : null}
        interrupted={Boolean(interruptedAssistantMessageIds?.[message.id])}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        conversationSearchTerms={conversationSearchTerms}
        canEdit={canEdit}
        editDisabledReason={resolvedEditDisabledReason}
        onStartEdit={
          !canEdit || resolvedEditDisabledReason
            ? undefined
            : (bubbleWidthPx?: number) => {
                setEditingBubbleWidthPx(bubbleWidthPx ?? null);
                setEditingMessageId(message.id);
              }
        }
        onCancelEdit={() => {
          setEditingMessageId(null);
          setEditingBubbleWidthPx(null);
        }}
        onSaveEdit={
          !onEditMessage
            ? undefined
            : async (text, attachments) => {
                const result = await onEditMessage(
                  message.id,
                  text,
                  attachments,
                );
                if (result === true) {
                  setEditingMessageId(null);
                  setEditingBubbleWidthPx(null);
                }
                return result;
              }
        }
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />,
    );
    index += 1;
  }

  if (waitingForResponse && lastMessage?.role !== ChatRoleEnum.assistant) {
    const pendingMessageId = lastMessage?.id
      ? `pending-${lastMessage.id}`
      : "pending";
    const placeholderMessage: AssistantChatMessage = {
      id: pendingMessageId,
      role: ChatRoleEnum.assistant,
      content: [],
      tool_calls: null,
    };
    output.push(
      <ChatMessage
        key={placeholderMessage.id}
        message={placeholderMessage}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        isSearchMatchActive={placeholderMessage.id === activeSearchMessageId}
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          placeholderMessage.id,
        )}
        onRedoMessage={onRedoMessage}
        interrupted={false}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
      />,
    );
  }

  return output;
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  allMessagesForToolResults,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeSearchMatchIndex = null,
  conversationSearchTerms = [],
  className,
  contentClassName,
  scrollRef,
  editDisabledReason,
  onConversationSearchMatchCountChange,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfoByMessage,
}: ChatMessageListProps) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSearchMessageId, setActiveSearchMessageId] = useState<
    string | null
  >(null);
  const setScrollContainerRef = useCallback(
    (nextNode: HTMLDivElement | null) => {
      internalScrollRef.current = nextNode;
      if (!scrollRef) {
        return;
      }
      if (typeof scrollRef === "function") {
        scrollRef(nextNode);
        return;
      }
      scrollRef.current = nextNode;
    },
    [scrollRef],
  );
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const toolResultMessages = allMessagesForToolResults ?? messages;
  const toolArgs = toolCallArguments ?? {};
  const wrapperClassName =
    `flex min-h-0 min-w-0 flex-1 flex-col-reverse overflow-x-hidden overflow-y-auto pr-1 ${className ?? ""}`.trim();
  const previousActiveSearchTargetRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const scrollContainer = internalScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const highlights = scrollContainer.querySelectorAll<HTMLElement>(
      'mark[data-chat-search-highlight="true"]',
    );
    highlights.forEach((highlight) => {
      highlight.removeAttribute("data-chat-search-highlight-target");
    });
    const searchMatchCount =
      conversationSearchTerms.length === 0 ? 0 : highlights.length;
    onConversationSearchMatchCountChange?.(searchMatchCount);
    if (searchMatchCount === 0 || activeSearchMatchIndex === null) {
      previousActiveSearchTargetRef.current = null;
      setActiveSearchMessageId(null);
      return;
    }
    const resolvedOccurrenceIndex = Math.min(
      Math.max(0, activeSearchMatchIndex),
      highlights.length - 1,
    );
    const activeHighlight = highlights[resolvedOccurrenceIndex] ?? null;
    activeHighlight?.setAttribute("data-chat-search-highlight-target", "true");
    const nextMessageId =
      activeHighlight
        ?.closest<HTMLElement>("[data-message-id]")
        ?.getAttribute("data-message-id") ?? null;
    setActiveSearchMessageId((current) =>
      current === nextMessageId ? current : nextMessageId,
    );
  }, [
    activeSearchMatchIndex,
    conversationSearchTerms,
    messages,
    onConversationSearchMatchCountChange,
  ]);

  useEffect(() => {
    if (
      activeSearchMatchIndex === null ||
      conversationSearchTerms.length === 0
    ) {
      previousActiveSearchTargetRef.current = null;
      return;
    }
    const activeSearchTargetKey = `${activeSearchMatchIndex}\u0000${conversationSearchTerms.join("\u0000")}`;
    if (previousActiveSearchTargetRef.current === activeSearchTargetKey) {
      return;
    }
    const scrollContainer = internalScrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const target = scrollContainer.querySelector<HTMLElement>(
      'mark[data-chat-search-highlight-target="true"]',
    );
    if (!target) {
      previousActiveSearchTargetRef.current = null;
      return;
    }
    previousActiveSearchTargetRef.current = activeSearchTargetKey;
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeSearchMatchIndex, conversationSearchTerms, messages]);

  return (
    <div
      ref={setScrollContainerRef}
      className={wrapperClassName}
      data-chat-message-list-scroll-container="true"
    >
      <div className={contentClassName}>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolArgs}
          interruptedAssistantMessageIds={interruptedAssistantMessageIds}
          activeSearchMessageId={activeSearchMessageId}
          conversationSearchTerms={conversationSearchTerms}
          allMessages={toolResultMessages}
          editDisabledReason={editDisabledReason}
          onRedoMessage={onRedoMessage}
          onEditMessage={onEditMessage}
          onBranchSwitch={onBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
        />
      </div>
    </div>
  );
});

function buildToolResultMap(
  messages: Array<BaseChatMessageUnion>,
): Record<string, ToolChatMessage> {
  const map: Record<string, ToolChatMessage> = {};
  for (const message of messages) {
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      map[message.tool_call_id] = message;
    }
  }
  return map;
}
