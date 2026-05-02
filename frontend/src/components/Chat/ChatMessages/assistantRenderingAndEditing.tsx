import { type Dispatch, ReactNode, type SetStateAction, memo } from "react";

import type { ChatMessageBranchInfo } from "state/actions/aiBranches";

import { type AskUserQuestionPayload, parseAnswers } from "utils/claudeTools";

import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";

import {
  ChatMessageTimestampFooter,
  resolveMessageCreatedAtMs,
} from "../chatTiming";

import { type AttachmentUrlEntry } from "../useChatMessageAttachmentUrls";

import {
  ActivityMessageContext,
  AssistantChatMessage,
} from "./modelAndAttachmentPreview";

import {
  hasMeaningfulAssistantDisplayItems,
  partitionAssistantContent,
} from "./activityPreviewsAndAttachmentDialog";

import { ChatAttachmentList } from "./attachmentListAndThinkingState";

import { AssistantActivitySection } from "./thoughtPreviewAndAssistantActivity";

import {
  AssistantActionSection,
  AssistantActivityActionsAnchor,
  AssistantMessageGroup,
  AssistantReasoningCard,
  AssistantToolCallCard,
  AssistantTypingIndicator,
  LLMChatBubble,
  StreamItem,
} from "./activityRowsAndBubbles";

import {
  AssistantChatMessageBodyProps,
  AssistantMessageRenderState,
  ChatMessageProps,
  EditableUserChatMessageBody,
  StaticChatMessageBody,
  buildCopyTextForMessage,
  resolveChatMessageProps,
  resolveMessageAttachments,
  useAssistantMessageRenderState,
  useChatMessageActionBar,
} from "./messageActionsAndStaticBodies";

export function renderAssistantActivitySection({
  message,
  actionBar,
  renderState,
  toolResultsById,
  toolCallArguments,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
}: {
  message: AssistantChatMessage;
  actionBar: ReactNode;
  renderState: AssistantMessageRenderState;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
}): ReactNode {
  if (!renderState.hasActivityContent) {
    return null;
  }
  return (
    <AssistantActivityActionsAnchor actions={actionBar}>
      <AssistantReasoningCard>
        <AssistantActivitySection
          preview={renderState.latestActivityPreview}
          itemCount={renderState.activityTimelineEntries.length}
          sectionState={renderState.activitySectionTiming.sectionState}
          startedAtMs={renderState.activitySectionTiming.startedAtMs}
          completedAtMs={renderState.activitySectionTiming.completedAtMs}
          runKey={`activity-${message.id}`}
          suppressThoughtScrollAnimation={
            renderState.suppressThoughtScrollAnimation
          }
          defaultOpen={
            activityAccordionOpenByDefault ||
            renderState.autoExpandPendingInteraction
          }
          defaultChildrenOpen={activityChildrenOpenByDefault}
          conversationSearchTerms={conversationSearchTerms}
        >
          {(showItemCopyButtons, childAccordionControl) => (
            <AssistantToolCallCard>
              <AssistantActionSection
                timelineEntries={renderState.activityTimelineEntries}
                toolResultsById={toolResultsById}
                toolCallArguments={toolCallArguments}
                showItemCopyButtons={showItemCopyButtons}
                defaultChildrenOpen={childAccordionControl.defaultOpen}
                openAllSignal={childAccordionControl.expandAllSignal}
                closeAllSignal={childAccordionControl.collapseAllSignal}
                suppressCollapsedSummary={
                  childAccordionControl.suppressSummaries
                }
                onThinkingOpenStateChange={
                  childAccordionControl.onThinkingOpenStateChange
                }
              />
            </AssistantToolCallCard>
          )}
        </AssistantActivitySection>
      </AssistantReasoningCard>
    </AssistantActivityActionsAnchor>
  );
}

export function renderAssistantBubble({
  message,
  attachments,
  attachmentUrlMap,
  requestAttachmentUrls,
  conversationSearchTerms,
  renderState,
  isStreaming,
  messageTimestampMs,
}: {
  message: AssistantChatMessage;
  attachments: ChatFileAttachment[];
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  conversationSearchTerms: Array<string>;
  renderState: AssistantMessageRenderState;
  isStreaming: boolean;
  messageTimestampMs: number | null;
}): ReactNode {
  if (!renderState.shouldRenderBubble) {
    return null;
  }
  return (
    <>
      <LLMChatBubble>
        <ChatAttachmentList
          attachments={attachments}
          isUser={false}
          attachmentUrlMap={attachmentUrlMap}
          requestAttachmentUrls={requestAttachmentUrls}
          conversationSearchTerms={conversationSearchTerms}
        />
        {renderState.displayItems.map(({ item, fullIndex }) => (
          <StreamItem
            key={fullIndex}
            item={item}
            isStreaming={isStreaming}
            runKey={`${message.id}-content-${fullIndex}`}
            conversationSearchTerms={conversationSearchTerms}
          />
        ))}
      </LLMChatBubble>
      <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />
    </>
  );
}

export function renderAssistantEmptyTimestamp({
  renderState,
  messageTimestampMs,
}: {
  renderState: AssistantMessageRenderState;
  messageTimestampMs: number | null;
}): ReactNode {
  if (renderState.shouldRenderBubble || renderState.hasActivityContent) {
    return null;
  }
  return <ChatMessageTimestampFooter timestampMs={messageTimestampMs} />;
}

export function resolveAssistantTypingIndicatorVisible(
  renderState: AssistantMessageRenderState,
): boolean {
  return (
    renderState.showTypingIndicator &&
    !renderState.hasMeaningfulDisplayItems &&
    !renderState.hasThinkingActivity
  );
}

export function AssistantChatMessageBody({
  message,
  attachments,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  actionBar,
  attachmentUrlMap,
  requestAttachmentUrls,
  interrupted,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
  messageTimestampMs,
}: AssistantChatMessageBodyProps) {
  const renderState = useAssistantMessageRenderState({
    message,
    attachments,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    suppressActivityThoughtScroll,
    suppressActivitySection,
    interrupted,
  });
  if (!renderState.shouldRenderBubble && !renderState.hasActivityContent) {
    if (renderState.showTypingIndicator) {
      return (
        <AssistantMessageGroup messageId={message.id}>
          <AssistantTypingIndicator visible={true} />
        </AssistantMessageGroup>
      );
    }
    return null;
  }
  return (
    <AssistantMessageGroup
      messageId={message.id}
      actions={renderState.hasActivityContent ? undefined : actionBar}
      isSearchMatchActive={isSearchMatchActive}
    >
      {renderAssistantActivitySection({
        message,
        actionBar,
        renderState,
        toolResultsById,
        toolCallArguments,
        activityAccordionOpenByDefault,
        activityChildrenOpenByDefault,
        conversationSearchTerms,
      })}
      {renderAssistantBubble({
        message,
        attachments,
        attachmentUrlMap,
        requestAttachmentUrls,
        conversationSearchTerms,
        renderState,
        isStreaming,
        messageTimestampMs,
      })}
      <AssistantTypingIndicator
        visible={resolveAssistantTypingIndicatorVisible(renderState)}
      />
      {renderAssistantEmptyTimestamp({
        renderState,
        messageTimestampMs,
      })}
    </AssistantMessageGroup>
  );
}

export type ResolvedChatMessageRenderProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  isSearchMatchActive: boolean;
  suppressActivityThoughtScroll: boolean;
  suppressActivitySection: boolean;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  isEditing: boolean;
  editingBubbleWidthPx?: number | null;
  interrupted: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  conversationSearchTerms: Array<string>;
  canEdit: boolean;
  editDisabledReason: string | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  actionBar: ReactNode;
  attachments: ChatFileAttachment[];
  messageTimestampMs: number | null;
};

export function renderResolvedChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  isSearchMatchActive,
  suppressActivityThoughtScroll,
  suppressActivitySection,
  attachmentUrlMap,
  requestAttachmentUrls,
  isEditing,
  editingBubbleWidthPx,
  interrupted,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  conversationSearchTerms,
  canEdit,
  editDisabledReason,
  onCancelEdit,
  onSaveEdit,
  actionBar,
  attachments,
  messageTimestampMs,
}: ResolvedChatMessageRenderProps): ReactNode {
  if (message.role === ChatRoleEnum.assistant) {
    return (
      <AssistantChatMessageBody
        message={message}
        attachments={attachments}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={isStreaming}
        isSearchMatchActive={isSearchMatchActive}
        suppressActivityThoughtScroll={suppressActivityThoughtScroll}
        suppressActivitySection={suppressActivitySection}
        actionBar={actionBar}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        interrupted={interrupted}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        conversationSearchTerms={conversationSearchTerms}
        messageTimestampMs={messageTimestampMs}
      />
    );
  }
  if (message.role === ChatRoleEnum.user && isEditing) {
    return (
      <EditableUserChatMessageBody
        message={message}
        attachments={attachments}
        editingBubbleWidthPx={editingBubbleWidthPx}
        canEdit={canEdit}
        editDisabled={Boolean(editDisabledReason)}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
      />
    );
  }
  return (
    <StaticChatMessageBody
      message={message}
      attachments={attachments}
      actionBar={actionBar}
      attachmentUrlMap={attachmentUrlMap}
      requestAttachmentUrls={requestAttachmentUrls}
      conversationSearchTerms={conversationSearchTerms}
      isSearchMatchActive={isSearchMatchActive}
      messageTimestampMs={messageTimestampMs}
    />
  );
}

export const ChatMessage = memo(function ChatMessage(props: ChatMessageProps) {
  const {
    message,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    isSearchMatchActive,
    suppressActivityThoughtScroll,
    suppressActivitySection,
    onRedoMessage,
    attachmentUrlMap,
    requestAttachmentUrls,
    isEditing,
    editingBubbleWidthPx,
    interrupted,
    activityAccordionOpenByDefault,
    activityChildrenOpenByDefault,
    conversationSearchTerms,
    canEdit,
    editDisabledReason,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    branchInfo,
    onBranchSwitch,
  } = resolveChatMessageProps(props);
  const attachments = resolveMessageAttachments(message);
  const actionBar = useChatMessageActionBar({
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
  });
  return renderResolvedChatMessage({
    message,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    isSearchMatchActive,
    suppressActivityThoughtScroll,
    suppressActivitySection,
    onRedoMessage,
    attachmentUrlMap,
    requestAttachmentUrls,
    isEditing,
    editingBubbleWidthPx,
    interrupted,
    activityAccordionOpenByDefault,
    activityChildrenOpenByDefault,
    conversationSearchTerms,
    canEdit,
    editDisabledReason,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    branchInfo,
    onBranchSwitch,
    actionBar,
    attachments,
    messageTimestampMs: resolveMessageCreatedAtMs(message),
  });
});

export function resolveQuestionAnswers(
  payload: AskUserQuestionPayload,
  toolResult: ToolChatMessage | undefined,
): Record<string, string> | null {
  if (toolResult) {
    const parsed = parseAnswers(toolResult.result);
    if (parsed) {
      return parsed;
    }
  }
  if (payload.answers) {
    return payload.answers;
  }
  return null;
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

export type ChatMessagesProps = {
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
};

export type GroupedAssistantActivityData = {
  firstMessageId: string;
  nextIndex: number;
  groupedMessages: AssistantChatMessage[];
  activityMessageContexts: ActivityMessageContext[];
  suppressedTrailingMessageId: string | null;
};

export type GroupedAssistantActivityMessageProps = {
  groupData: GroupedAssistantActivityData;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  activeSearchMessageId?: string | null;
  conversationSearchTerms: Array<string>;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfo?: ChatMessageBranchInfo;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  suppressActivityThoughtScrollAnimation: boolean;
};

export type RenderableChatMessageProps = {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  activeSearchMessageId?: string | null;
  conversationSearchTerms: Array<string>;
  onRedoMessage?: (messageId: string) => Promise<boolean> | boolean;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  onBranchSwitch?: (nextChatId: string) => void;
  branchInfo?: ChatMessageBranchInfo;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
  interrupted: boolean;
  suppressActivityThoughtScrollAnimation: boolean;
  suppressActivitySection: boolean;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  canEditParams: boolean;
  editDisabledReason?: string | null;
  editingMessageId: string | null;
  editingBubbleWidthPx: number | null;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>;
};

export function buildActivityMessageContext({
  message,
  waitingForResponse,
  streamingMessageId,
  interruptedAssistantMessageIds,
}: {
  message: AssistantChatMessage;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  interruptedAssistantMessageIds?: Record<string, true>;
}): ActivityMessageContext {
  return {
    message,
    isStreaming: waitingForResponse && message.id === streamingMessageId,
    wasInterrupted: Boolean(interruptedAssistantMessageIds?.[message.id]),
  };
}

export function isAssistantMessageWithActivity(
  message: BaseChatMessageUnion | undefined,
): message is AssistantChatMessage {
  return (
    message?.role === ChatRoleEnum.assistant &&
    !isAssistantActivityOnlyMessage(message) &&
    hasAssistantActivityContent(message)
  );
}

export function collectGroupedAssistantActivityData({
  messages,
  startIndex,
  waitingForResponse,
  streamingMessageId,
  interruptedAssistantMessageIds,
}: {
  messages: Array<BaseChatMessageUnion>;
  startIndex: number;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
  interruptedAssistantMessageIds?: Record<string, true>;
}): GroupedAssistantActivityData | null {
  const firstMessage = messages[startIndex];
  if (!firstMessage || !isAssistantActivityOnlyMessage(firstMessage)) {
    return null;
  }
  const groupedMessages: AssistantChatMessage[] = [];
  const activityMessageContexts: ActivityMessageContext[] = [];
  let groupEnd = startIndex;
  while (groupEnd < messages.length) {
    const nextMessage = messages[groupEnd];
    if (!isAssistantActivityOnlyMessage(nextMessage)) {
      break;
    }
    groupedMessages.push(nextMessage);
    activityMessageContexts.push(
      buildActivityMessageContext({
        message: nextMessage,
        waitingForResponse,
        streamingMessageId,
        interruptedAssistantMessageIds,
      }),
    );
    groupEnd += 1;
  }
  const trailingAssistantMessage = messages[groupEnd];
  if (!isAssistantMessageWithActivity(trailingAssistantMessage)) {
    return {
      firstMessageId: firstMessage.id,
      nextIndex: groupEnd,
      groupedMessages,
      activityMessageContexts,
      suppressedTrailingMessageId: null,
    };
  }
  activityMessageContexts.push(
    buildActivityMessageContext({
      message: trailingAssistantMessage,
      waitingForResponse,
      streamingMessageId,
      interruptedAssistantMessageIds,
    }),
  );
  return {
    firstMessageId: firstMessage.id,
    nextIndex: groupEnd,
    groupedMessages,
    activityMessageContexts,
    suppressedTrailingMessageId: trailingAssistantMessage.id,
  };
}

export function buildGroupedAssistantActivityCopyText({
  groupedMessages,
  toolResultsById,
  toolCallArguments,
}: {
  groupedMessages: AssistantChatMessage[];
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
}): string {
  return groupedMessages
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
}

export function resolveChatMessageEditDisabledReason({
  canEditParams,
  waitingForResponse,
  editDisabledReason,
}: {
  canEditParams: boolean;
  waitingForResponse: boolean;
  editDisabledReason?: string | null;
}): string | null {
  if (!canEditParams) {
    return "Editing disabled by share policy.";
  }
  if (waitingForResponse) {
    return "Wait for response to finish.";
  }
  return editDisabledReason ?? null;
}

export function startEditingMessage(
  messageId: string,
  bubbleWidthPx: number | undefined,
  setEditingMessageId: Dispatch<SetStateAction<string | null>>,
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>,
) {
  setEditingBubbleWidthPx(bubbleWidthPx ?? null);
  setEditingMessageId(messageId);
}

export function stopEditingMessage(
  setEditingMessageId: Dispatch<SetStateAction<string | null>>,
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>,
) {
  setEditingMessageId(null);
  setEditingBubbleWidthPx(null);
}

export function createSaveEditHandler({
  messageId,
  onEditMessage,
  setEditingMessageId,
  setEditingBubbleWidthPx,
}: {
  messageId: string;
  onEditMessage?: (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean> | boolean;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingBubbleWidthPx: Dispatch<SetStateAction<number | null>>;
}) {
  if (!onEditMessage) {
    return undefined;
  }
  return async (text: string, attachments: ChatFileAttachment[]) => {
    const result = await onEditMessage(messageId, text, attachments);
    if (result === true) {
      stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
    }
    return result;
  };
}

export function resolveSuppressActivityThoughtScrollAnimation({
  messages,
  waitingForResponse,
  streamingMessageId,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  streamingMessageId: string | null;
}): boolean {
  if (!waitingForResponse || !streamingMessageId) {
    return false;
  }
  const streamingMessage = messages.find(
    (message) => message.id === streamingMessageId,
  );
  if (!streamingMessage || streamingMessage.role !== ChatRoleEnum.assistant) {
    return false;
  }
  const { displayItems } = partitionAssistantContent(streamingMessage.content);
  return hasMeaningfulAssistantDisplayItems(displayItems);
}

export function resolvePendingAssistantPlaceholderMessage({
  waitingForResponse,
  lastMessage,
}: {
  waitingForResponse: boolean;
  lastMessage: BaseChatMessageUnion | undefined;
}): AssistantChatMessage | null {
  if (!waitingForResponse || lastMessage?.role === ChatRoleEnum.assistant) {
    return null;
  }
  const pendingMessageId = lastMessage?.id
    ? `pending-${lastMessage.id}`
    : "pending";
  return {
    id: pendingMessageId,
    role: ChatRoleEnum.assistant,
    content: [],
    tool_calls: null,
  };
}
