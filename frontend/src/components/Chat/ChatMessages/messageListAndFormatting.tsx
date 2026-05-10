import {
  ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAIStore } from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";

import { useChatMessageAttachmentUrls } from "../useChatMessageAttachmentUrls";

import {
  ChatMessageListProps,
  ToolResultContentEntry,
  ToolResultValue,
  assignScrollRef,
  syncActiveSearchHighlight,
} from "./modelAndAttachmentPreview";

import {
  buildActivityTimelineEntries,
  copyTextWithNotifications,
} from "./streamingMarkdownAndToolLabels";

import {
  resolveLatestActivityPreview,
  resolveStreamingAssistantMessageId,
} from "./activityPreviewsAndAttachmentDialog";

import { AssistantActivitySection } from "./thoughtPreviewAndAssistantActivity";

import {
  AssistantActionSection,
  AssistantActivityActionsAnchor,
  AssistantMessageGroup,
  AssistantReasoningCard,
  AssistantToolCallCard,
  hasPendingInteractiveToolCallsInMessages,
  resolveActivitySectionTiming,
} from "./activityRowsAndBubbles";

import {
  ChatMessageActions,
  createRedoMessageHandler,
} from "./messageActionsAndStaticBodies";

import {
  ChatMessage,
  ChatMessagesProps,
  GroupedAssistantActivityMessageProps,
  RenderableChatMessageProps,
  buildGroupedAssistantActivityCopyText,
  collectGroupedAssistantActivityData,
  createSaveEditHandler,
  resolveChatMessageEditDisabledReason,
  resolvePendingAssistantPlaceholderMessage,
  resolveSuppressActivityThoughtScrollAnimation,
  startEditingMessage,
  stopEditingMessage,
} from "./assistantRenderingAndEditing";

const GroupedAssistantActivityMessage = memo(
  function GroupedAssistantActivityMessage({
    groupData,
    toolResultsById,
    toolCallArguments,
    waitingForResponse,
    activeSearchMessageId,
    conversationSearchTerms,
    onRedoMessage,
    onBranchSwitch,
    branchInfo,
    activityAccordionOpenByDefault,
    activityChildrenOpenByDefault,
    suppressActivityThoughtScrollAnimation,
  }: GroupedAssistantActivityMessageProps) {
    const timelineEntries = useMemo(
      () =>
        buildActivityTimelineEntries(
          groupData.activityMessageContexts,
          toolResultsById,
        ),
      [groupData.activityMessageContexts, toolResultsById],
    );
    const activityMessages = useMemo(
      () => groupData.activityMessageContexts.map((context) => context.message),
      [groupData.activityMessageContexts],
    );
    const latestActivityPreview = useMemo(
      () =>
        resolveLatestActivityPreview({
          timelineEntries,
          toolResultsById,
          toolCallArguments,
        }),
      [timelineEntries, toolCallArguments, toolResultsById],
    );
    const activitySectionTiming = useMemo(
      () =>
        resolveActivitySectionTiming({
          timelineEntries,
          toolResultsById,
        }),
      [timelineEntries, toolResultsById],
    );
    const autoExpandPendingInteraction = useMemo(
      () =>
        hasPendingInteractiveToolCallsInMessages(
          activityMessages,
          toolResultsById,
        ),
      [activityMessages, toolResultsById],
    );
    const handleGroupedCopy = useCallback(() => {
      const text = buildGroupedAssistantActivityCopyText({
        groupedMessages: groupData.groupedMessages,
        toolResultsById,
        toolCallArguments,
      });
      copyTextWithNotifications({
        text,
        emptyMessage: "Nothing to copy for this message.",
        successMessage: "Copied message.",
        failureMessage: "Failed to copy message.",
      });
    }, [groupData.groupedMessages, toolCallArguments, toolResultsById]);
    const redoHandler = useMemo(
      () => createRedoMessageHandler(groupData.firstMessageId, onRedoMessage),
      [groupData.firstMessageId, onRedoMessage],
    );
    if (timelineEntries.length === 0) {
      return null;
    }
    const actionBar = (
      <ChatMessageActions
        onCopy={handleGroupedCopy}
        showRedo={redoHandler !== undefined}
        onRedo={redoHandler}
        redoDisabled={waitingForResponse}
        redoDisabledReason={
          waitingForResponse ? "Wait for response to finish." : null
        }
        showEdit={false}
        editDisabled={false}
        editDisabledReason={null}
        branchInfo={branchInfo}
        onBranchSwitch={onBranchSwitch}
      />
    );
    return (
      <AssistantMessageGroup
        messageId={groupData.firstMessageId}
        isSearchMatchActive={groupData.firstMessageId === activeSearchMessageId}
      >
        <AssistantActivityActionsAnchor actions={actionBar}>
          <AssistantReasoningCard>
            <AssistantActivitySection
              preview={latestActivityPreview}
              itemCount={timelineEntries.length}
              sectionState={activitySectionTiming.sectionState}
              startedAtMs={activitySectionTiming.startedAtMs}
              completedAtMs={activitySectionTiming.completedAtMs}
              runKey={`activity-${groupData.firstMessageId}`}
              suppressThoughtScrollAnimation={
                suppressActivityThoughtScrollAnimation
              }
              defaultOpen={
                activityAccordionOpenByDefault || autoExpandPendingInteraction
              }
              defaultChildrenOpen={activityChildrenOpenByDefault}
              conversationSearchTerms={conversationSearchTerms}
            >
              {(showItemCopyButtons, childAccordionControl) => (
                <AssistantToolCallCard>
                  <AssistantActionSection
                    timelineEntries={timelineEntries}
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
      </AssistantMessageGroup>
    );
  },
);

function RenderableChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  waitingForResponse,
  streamingMessageId,
  activeSearchMessageId,
  conversationSearchTerms,
  onRedoMessage,
  onEditMessage,
  onBranchSwitch,
  branchInfo,
  attachmentUrlMap,
  requestAttachmentUrls,
  interrupted,
  suppressActivityThoughtScrollAnimation,
  suppressActivitySection,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  canEditParams,
  editDisabledReason,
  editingMessageId,
  editingBubbleWidthPx,
  setEditingMessageId,
  setEditingBubbleWidthPx,
}: RenderableChatMessageProps) {
  const canEdit = Boolean(onEditMessage);
  const isEditing = editingMessageId === message.id;
  const resolvedEditDisabledReason = resolveChatMessageEditDisabledReason({
    canEditParams,
    waitingForResponse,
    editDisabledReason,
  });
  const saveEditHandler = createSaveEditHandler({
    messageId: message.id,
    onEditMessage,
    setEditingMessageId,
    setEditingBubbleWidthPx,
  });
  return (
    <ChatMessage
      message={message}
      toolResultsById={toolResultsById}
      toolCallArguments={toolCallArguments}
      isStreaming={
        waitingForResponse &&
        message.role === ChatRoleEnum.assistant &&
        message.id === streamingMessageId
      }
      isSearchMatchActive={message.id === activeSearchMessageId}
      suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
      suppressActivitySection={suppressActivitySection}
      onRedoMessage={onRedoMessage}
      attachmentUrlMap={attachmentUrlMap}
      requestAttachmentUrls={requestAttachmentUrls}
      isEditing={isEditing}
      editingBubbleWidthPx={isEditing ? editingBubbleWidthPx : null}
      interrupted={interrupted}
      activityAccordionOpenByDefault={activityAccordionOpenByDefault}
      activityChildrenOpenByDefault={activityChildrenOpenByDefault}
      conversationSearchTerms={conversationSearchTerms}
      canEdit={canEdit}
      editDisabledReason={resolvedEditDisabledReason}
      onStartEdit={
        !canEdit || resolvedEditDisabledReason
          ? undefined
          : (bubbleWidthPx?: number) => {
              startEditingMessage(
                message.id,
                bubbleWidthPx,
                setEditingMessageId,
                setEditingBubbleWidthPx,
              );
            }
      }
      onCancelEdit={() => {
        stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
      }}
      onSaveEdit={saveEditHandler}
      branchInfo={branchInfo}
      onBranchSwitch={onBranchSwitch}
    />
  );
}

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
}: ChatMessagesProps) {
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
    useChatMessageAttachmentUrls(messages);
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );
  const lastMessage = messages[messages.length - 1];
  const streamingMessageId = useMemo(
    () =>
      waitingForResponse ? resolveStreamingAssistantMessageId(messages) : null,
    [messages, waitingForResponse],
  );
  const suppressActivityThoughtScrollAnimation = useMemo(
    () =>
      resolveSuppressActivityThoughtScrollAnimation({
        messages,
        waitingForResponse,
        streamingMessageId,
      }),
    [messages, streamingMessageId, waitingForResponse],
  );

  useEffect(() => {
    if (waitingForResponse) {
      stopEditingMessage(setEditingMessageId, setEditingBubbleWidthPx);
    }
  }, [waitingForResponse]);

  const output: ReactNode[] = [];
  const suppressedActivitySectionMessageIds = new Set<string>();
  let index = 0;
  while (index < messages.length) {
    const activityGroup = collectGroupedAssistantActivityData({
      messages,
      startIndex: index,
      waitingForResponse,
      streamingMessageId,
      interruptedAssistantMessageIds,
    });
    if (activityGroup) {
      if (activityGroup.suppressedTrailingMessageId) {
        suppressedActivitySectionMessageIds.add(
          activityGroup.suppressedTrailingMessageId,
        );
      }
      output.push(
        <GroupedAssistantActivityMessage
          key={`tool-call-group-${activityGroup.firstMessageId}`}
          groupData={activityGroup}
          toolResultsById={toolResultsById}
          toolCallArguments={toolCallArguments}
          waitingForResponse={waitingForResponse}
          activeSearchMessageId={activeSearchMessageId}
          conversationSearchTerms={conversationSearchTerms}
          onRedoMessage={onRedoMessage}
          onBranchSwitch={onBranchSwitch}
          branchInfo={branchInfoByMessage?.[activityGroup.firstMessageId]}
          activityAccordionOpenByDefault={activityAccordionOpenByDefault}
          activityChildrenOpenByDefault={activityChildrenOpenByDefault}
          suppressActivityThoughtScrollAnimation={
            suppressActivityThoughtScrollAnimation
          }
        />,
      );
      index = activityGroup.nextIndex;
      continue;
    }
    const message = messages[index];
    output.push(
      <RenderableChatMessage
        key={message.id}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        waitingForResponse={waitingForResponse}
        streamingMessageId={streamingMessageId}
        activeSearchMessageId={activeSearchMessageId}
        conversationSearchTerms={conversationSearchTerms}
        onRedoMessage={onRedoMessage}
        onEditMessage={onEditMessage}
        onBranchSwitch={onBranchSwitch}
        branchInfo={branchInfoByMessage?.[message.id]}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        interrupted={Boolean(interruptedAssistantMessageIds?.[message.id])}
        suppressActivityThoughtScrollAnimation={
          suppressActivityThoughtScrollAnimation
        }
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          message.id,
        )}
        activityAccordionOpenByDefault={activityAccordionOpenByDefault}
        activityChildrenOpenByDefault={activityChildrenOpenByDefault}
        canEditParams={canEditParams}
        editDisabledReason={editDisabledReason}
        editingMessageId={editingMessageId}
        editingBubbleWidthPx={editingBubbleWidthPx}
        setEditingMessageId={setEditingMessageId}
        setEditingBubbleWidthPx={setEditingBubbleWidthPx}
      />,
    );
    index += 1;
  }

  const pendingAssistantMessage = resolvePendingAssistantPlaceholderMessage({
    waitingForResponse,
    lastMessage,
  });
  if (pendingAssistantMessage) {
    output.push(
      <ChatMessage
        key={pendingAssistantMessage.id}
        message={pendingAssistantMessage}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        isSearchMatchActive={
          pendingAssistantMessage.id === activeSearchMessageId
        }
        suppressActivityThoughtScroll={suppressActivityThoughtScrollAnimation}
        suppressActivitySection={suppressedActivitySectionMessageIds.has(
          pendingAssistantMessage.id,
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
      assignScrollRef(scrollRef, nextNode);
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
    syncActiveSearchHighlight({
      scrollContainer,
      conversationSearchTerms,
      activeSearchMatchIndex,
      previousActiveSearchTargetRef,
      onConversationSearchMatchCountChange,
      setActiveSearchMessageId,
    });
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

export function formatToolResult(
  toolResult: ToolChatMessage | undefined,
): ToolResultValue | undefined {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    const renderedEntries = toolResult.content
      .map(formatToolResultContentEntry)
      .filter((entry) => entry.trim().length > 0);
    if (renderedEntries.length > 0) {
      return renderedEntries.join("\n\n");
    }
  }
  return toolResult.result;
}

function formatResourceToolResultContentEntry(
  entry: Extract<ToolResultContentEntry, { type: "resource" }>,
): string {
  const uri = entry.resource?.uri;
  const mimeType = entry.resource?.mimeType;
  if (!uri) {
    return mimeType ? `Resource (${mimeType})` : "Resource";
  }
  return mimeType ? `Resource: ${uri} (${mimeType})` : `Resource: ${uri}`;
}

function formatImageToolResultContentEntry(
  entry: Extract<ToolResultContentEntry, { type: "image" }>,
): string {
  return entry.mimeType ? `Image (${entry.mimeType})` : "Image";
}

function formatToolResultContentEntry(entry: ToolResultContentEntry): string {
  switch (entry.type) {
    case "text":
      return entry.text;
    case "tool_reference":
      return `Tool reference: ${entry.tool_name}`;
    case "resource":
      return formatResourceToolResultContentEntry(entry);
    case "image":
      return formatImageToolResultContentEntry(entry);
    default:
      return JSON.stringify(entry, null, 2);
  }
}
