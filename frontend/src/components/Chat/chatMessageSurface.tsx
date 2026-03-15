import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { memo, useCallback, useMemo } from "react";
import { MdErrorOutline } from "react-icons/md";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { C } from "utils/c";
import {
  type BaseChatMessageUnion,
  type ChatFileAttachment,
  ChatRoleEnum,
  type ToolChatMessage,
} from "utils/generatedTypes";
import {
  buildActivityTimelineEntries,
  buildCopyTextForMessage,
  type ChatContentItem,
  getStreamActivitySummary,
  hasMeaningfulAssistantDisplayItems,
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
import type {
  ChatAttachmentUrlMap,
  RequestChatAttachmentUrls,
} from "./chatAttachmentPreviewUrls";
import { copyTextWithNotifications } from "./chatCopyText";
import { ChatMessageActions } from "./chatMessageActions";
import {
  AssistantMessageGroup,
  LLMChatBubble,
  SystemChatBubble,
  UserChatBubble,
} from "./chatMessageBubbles";
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

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;
const ASSISTANT_ERROR_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} dark:prose-invert prose-headings:text-red-900 dark:prose-headings:text-red-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-red-400`;
const USER_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-950 dark:prose-invert dark:text-white prose-headings:text-blue-900 dark:prose-headings:text-blue-200 prose-p:text-[13px] prose-ul:text-[13px] prose-ol:text-[13px] prose-li:text-[13px] [&_*]:marker:text-setta-400`;
const SYSTEM_MARKDOWN_CLASS = `${CHAT_MARKDOWN_BASE_CLASS} text-setta-600 dark:prose-invert prose-headings:text-setta-600 dark:prose-headings:text-setta-300 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-ul:text-[12px] prose-ol:text-[12px] prose-li:text-[12px] [&_*]:marker:text-setta-400`;

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

// Owns a single chat row's render branches so ChatMessages.tsx stays focused on list coordination.
export const ChatMessage = memo(function ChatMessage({
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
  const activityTimelineEntries = useMemo(() => {
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

function getPlainTextFromMessage(message: BaseChatMessageUnion): string {
  return (message.content ?? [])
    .map((item) => {
      if (item.type === C.LLM_TEXT) {
        return item.text;
      }
      if (item.type === C.LLM_THINKING) {
        return item.thinking;
      }
      return "";
    })
    .join("\n\n")
    .trim();
}
