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
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";
import { useAIStore } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  ToolChatMessage,
} from "utils/generatedTypes";
import {
  type ActivityMessageContext,
  buildActivityTimelineEntries,
  buildCopyTextForMessage,
  hasAssistantActivityContent,
  hasMeaningfulAssistantDisplayItems,
  isAssistantActivityOnlyMessage,
  partitionAssistantContent,
} from "./chatAssistantActivity";
import { AssistantActivityCard } from "./chatAssistantActivityCard";
import { useChatAttachmentPreviewUrls } from "./chatAttachmentPreviewUrls";
import { copyTextWithNotifications } from "./chatCopyText";
import { ChatMessageActions } from "./chatMessageActions";
import { AssistantMessageGroup } from "./chatMessageBubbles";
import { ChatMessage } from "./chatMessageSurface";

export { buildCopyTextForMessage };

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
  const streamingMessageId = waitingForResponse
    ? resolveStreamingAssistantMessageId(messages)
    : null;
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
      const groupedMessages: Array<BaseChatMessageUnion> = [];
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
    const placeholderMessage: BaseChatMessageUnion = {
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
