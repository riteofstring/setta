import type {
  ApprovalAnswer,
  ChatEvent,
  ChatMessage,
  Conversation,
  ConversationListItem,
  MessagePage,
  Run,
} from "@generated/backend";
import { create } from "zustand";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "editing"
  | "loading"
  | "loadingOlder"
  | "refreshing"
  | "sending"
  | null;

interface ChatStore {
  activeRun: Run | null;
  conversations: ConversationListItem[];
  error: string | null;
  hasMoreOlder: boolean;
  handleEvent: (event: ChatEvent) => void;
  lastEventSequence: number;
  lastEventStreamId: string;
  loadOlder: () => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => void;
  messages: ChatMessage[];
  operation: ChatOperation;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  selectedConversation: Conversation | null;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (prompt: string) => Promise<void>;
  status: ChatStatus;
  stopActiveRun: () => Promise<void>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
  updateUserMessage: (messageId: string, text: string) => Promise<void>;
  unreadConversationIds: Record<string, true>;
  workspaceId: string | null;
}

type ChatPatch = Partial<
  Pick<
    ChatStore,
    | "activeRun"
    | "conversations"
    | "error"
    | "hasMoreOlder"
    | "lastEventSequence"
    | "lastEventStreamId"
    | "messages"
    | "operation"
    | "selectedConversation"
    | "status"
    | "unreadConversationIds"
    | "workspaceId"
  >
>;

const pageLimit = 40;
let operationSequence = 0;
let currentOperationId = 0;

export const useChatStore = create<ChatStore>((set, get) => {
  function beginOperation(patch: ChatPatch) {
    operationSequence += 1;
    currentOperationId = operationSequence;
    set(patch);
    return currentOperationId;
  }

  function commitCurrent(operationId: number, patch: ChatPatch) {
    if (operationId !== currentOperationId) {
      return;
    }
    currentOperationId = 0;
    set(patch);
  }

  function commitCurrentFromState(
    operationId: number,
    patchForState: (state: ChatStore) => ChatPatch,
  ) {
    if (operationId !== currentOperationId) {
      return;
    }
    const patch = patchForState(get());
    currentOperationId = 0;
    set(patch);
  }

  async function loadConversationPage(workspaceId: string, conversation: Conversation) {
    const page = await window.setta.chat.messagePage(workspaceId, conversation.id, 0, pageLimit);
    const active = await window.setta.chat.activeRun(workspaceId, conversation.id);
    return pagePatch(page, active.hasActiveRun ? active.run : null);
  }

  async function reloadConversations(workspaceId: string) {
    return window.setta.chat.listConversations(workspaceId);
  }

  return {
    activeRun: null,
    conversations: [],
    createConversation: async (title = "") => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      await get().createWorkspaceConversation(workspaceId, title);
    },
    createWorkspaceConversation: async (workspaceId, title = "") => {
      const switchingWorkspace = get().workspaceId !== workspaceId;
      const operationId = beginOperation({
        activeRun: switchingWorkspace ? null : get().activeRun,
        error: null,
        hasMoreOlder: switchingWorkspace ? false : get().hasMoreOlder,
        messages: switchingWorkspace ? [] : get().messages,
        operation: "creating",
        selectedConversation: switchingWorkspace ? null : get().selectedConversation,
        status: switchingWorkspace ? "loading" : get().status,
        workspaceId,
      });
      try {
        const conversation = await window.setta.chat.createConversation(workspaceId, title);
        const list = await reloadConversations(workspaceId);
        const patch = await loadConversationPage(workspaceId, conversation);
        commitCurrent(operationId, {
          ...patch,
          conversations: list.conversations,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    error: null,
    hasMoreOlder: false,
    handleEvent: (event) => {
      const state = get();
      if (event.type === "chat.resync_required") {
        set({
          lastEventSequence: event.payload.currentSequence,
          lastEventStreamId: event.payload.currentStreamId,
        });
        void get().resyncActiveConversation();
        return;
      }
      if (isUnexpectedStream(state, event)) {
        set({ lastEventSequence: event.sequence, lastEventStreamId: event.streamId });
        void get().resyncActiveConversation();
        return;
      }
      if (isDuplicateEvent(state, event)) {
        return;
      }
      if (hasSequenceGap(state, event)) {
        set({ lastEventSequence: event.sequence, lastEventStreamId: event.streamId });
        void get().resyncActiveConversation();
        return;
      }
      const result = applyChatEvent(state, event);
      const unreadPatch = unreadConversationPatch(state, event);
      set({
        ...result.patch,
        ...unreadPatch,
        lastEventSequence: event.sequence,
        lastEventStreamId: event.streamId,
      });
      if (result.resync) {
        void get().resyncActiveConversation();
      }
    },
    loadOlder: async () => {
      const { messages, selectedConversation, workspaceId } = get();
      const firstMessage = messages[0];
      if (!workspaceId || !selectedConversation || !firstMessage || !get().hasMoreOlder) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "loadingOlder" });
      try {
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          firstMessage.ordinal,
          pageLimit,
        );
        commitCurrentFromState(operationId, (current) => {
          if (
            current.workspaceId !== workspaceId ||
            current.selectedConversation?.id !== selectedConversation.id
          ) {
            return { operation: null };
          }
          return {
            hasMoreOlder: page.hasMoreOlder,
            messages: prependOlderMessages(page.messages, current.messages),
            operation: null,
            status: "ready",
          };
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    loadWorkspace: async (workspaceId: string) => {
      const operationId = beginOperation({
        activeRun: null,
        error: null,
        hasMoreOlder: false,
        messages: [],
        operation: "loading",
        selectedConversation: null,
        status: "loading",
        workspaceId,
      });
      try {
        const list = await reloadConversations(workspaceId);
        const first = list.conversations[0]?.conversation ?? null;
        const patch = first
          ? await loadConversationPage(workspaceId, first)
          : emptyConversationPatch();
        commitCurrent(operationId, {
          ...patch,
          conversations: list.conversations,
          operation: null,
          selectedConversation: first,
          status: "ready",
          unreadConversationIds: {},
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    lastEventSequence: 0,
    lastEventStreamId: "",
    markConversationRead: (conversationId) => {
      set((state) => ({
        unreadConversationIds: withoutConversation(state.unreadConversationIds, conversationId),
      }));
    },
    messages: [],
    operation: null,
    resyncActiveConversation: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "refreshing" });
      try {
        const list = await reloadConversations(workspaceId);
        const nextConversation = selectedConversation
          ? (list.conversations.find((item) => item.conversation.id === selectedConversation.id)
              ?.conversation ?? selectedConversation)
          : (list.conversations[0]?.conversation ?? null);
        const patch = nextConversation
          ? await loadConversationPage(workspaceId, nextConversation)
          : emptyConversationPatch();
        commitCurrent(operationId, {
          ...patch,
          conversations: list.conversations,
          operation: null,
          selectedConversation: nextConversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    selectConversation: async (conversationId: string) => {
      const { conversations, workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      const conversation =
        conversations.find((item) => item.conversation.id === conversationId)?.conversation ?? null;
      if (!conversation) {
        set({ error: `conversation not found: ${conversationId}`, status: "error" });
        return;
      }
      const operationId = beginOperation({ error: null, operation: "loading" });
      try {
        const patch = await loadConversationPage(workspaceId, conversation);
        commitCurrentFromState(operationId, (current) => {
          return {
            ...patch,
            operation: null,
            selectedConversation: conversation,
            status: "ready",
            unreadConversationIds: withoutConversation(
              current.unreadConversationIds,
              conversation.id,
            ),
          };
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    selectedConversation: null,
    sendMessage: async (prompt: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "sending" });
      try {
        const result = await window.setta.chat.sendMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        commitCurrent(operationId, {
          ...pagePatch(result.page, result.run),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    status: "idle",
    stopActiveRun: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "cancelling" });
      try {
        const run = await window.setta.chat.cancelRun(workspaceId, selectedConversation.id);
        commitCurrent(operationId, {
          activeRun: run,
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    submitApproval: async (approvalId, approved, response, answers, cancelled) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "approving" });
      try {
        const run = await window.setta.chat.submitApproval({
          approvalId,
          approved,
          answers,
          cancelled,
          conversationId: selectedConversation.id,
          response,
          workspaceId,
        });
        commitCurrent(operationId, {
          activeRun: run.status === "running" ? run : null,
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    updateUserMessage: async (messageId, text) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "editing" });
      try {
        const message = await window.setta.chat.updateUserMessage(
          workspaceId,
          selectedConversation.id,
          messageId,
          text,
        );
        commitCurrentFromState(operationId, (current) => ({
          messages: upsertMessage(current.messages, message),
          operation: null,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    unreadConversationIds: {},
    workspaceId: null,
  };
});

function isUnexpectedStream(state: ChatStore, event: ChatEvent): boolean {
  return state.lastEventStreamId !== "" && event.streamId !== state.lastEventStreamId;
}

function isDuplicateEvent(state: ChatStore, event: ChatEvent): boolean {
  return event.streamId === state.lastEventStreamId && event.sequence <= state.lastEventSequence;
}

function hasSequenceGap(state: ChatStore, event: ChatEvent): boolean {
  return (
    event.streamId === state.lastEventStreamId &&
    state.lastEventSequence !== 0 &&
    event.sequence !== state.lastEventSequence + 1
  );
}

function pagePatch(page: MessagePage, activeRun: Run | null): ChatPatch {
  return {
    activeRun,
    hasMoreOlder: page.hasMoreOlder,
    messages: page.messages,
    selectedConversation: page.conversation,
  };
}

function emptyConversationPatch(): ChatPatch {
  return {
    activeRun: null,
    hasMoreOlder: false,
    messages: [],
    selectedConversation: null,
  };
}

function errorPatch(error: unknown): ChatPatch {
  return {
    error: error instanceof Error ? error.message : "Chat operation failed",
    operation: null,
    status: "error",
  };
}

export function prependOlderMessages(
  olderMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  const currentIDs = new Set(currentMessages.map((message) => message.id));
  return [...olderMessages.filter((message) => !currentIDs.has(message.id)), ...currentMessages];
}

interface EventApplyResult {
  patch: ChatPatch;
  resync: boolean;
}

function applyChatEvent(
  state: ChatStore,
  event: Exclude<ChatEvent, { type: "chat.resync_required" }>,
): EventApplyResult {
  switch (event.type) {
    case "chat.message.created":
      return selectedConversationEventResult(state, event, {
        messages: upsertMessage(state.messages, event.payload.message),
        status: "ready",
      });
    case "chat.assistant_text_delta":
      return applyAssistantTextDelta(state, event);
    case "chat.message.updated":
      return selectedConversationEventResult(state, event, {
        messages: upsertMessage(state.messages, event.payload.message),
        status: "ready",
      });
    case "chat.run.updated":
      return selectedConversationEventResult(state, event, {
        activeRun: event.payload.run,
        status: "ready",
      });
    case "chat.conversation.updated":
      return workspaceEventResult(
        state,
        event,
        conversationUpdatedPatch(state, event.payload.item),
      );
    default:
      return assertNever(event);
  }
}

function selectedConversationEventResult(
  state: ChatStore,
  event: ChatEvent,
  patch: ChatPatch,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  return { patch, resync: false };
}

function workspaceEventResult(
  state: ChatStore,
  event: ChatEvent,
  patch: ChatPatch,
): EventApplyResult {
  if (state.workspaceId !== event.workspaceId) {
    return unchangedEventResult();
  }
  return { patch, resync: false };
}

function applyAssistantTextDelta(
  state: ChatStore,
  event: Extract<ChatEvent, { type: "chat.assistant_text_delta" }>,
): EventApplyResult {
  if (!isSelectedConversationEvent(state, event)) {
    return unchangedEventResult();
  }
  let foundMessage = false;
  let foundPart = false;
  const messages = state.messages.map((message) => {
    if (message.id !== event.payload.messageId) {
      return message;
    }
    foundMessage = true;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.id !== event.payload.partId) {
          return part;
        }
        foundPart = true;
        return { ...part, text: part.text + event.payload.delta };
      }),
      updatedAt: event.payload.updatedAt,
    };
  });
  if (!foundMessage || !foundPart) {
    return { patch: {}, resync: true };
  }
  return { patch: { messages, status: "ready" }, resync: false };
}

function conversationUpdatedPatch(state: ChatStore, item: ConversationListItem): ChatPatch {
  const selectedConversation =
    state.selectedConversation?.id === item.conversation.id
      ? item.conversation
      : state.selectedConversation;
  return {
    conversations: upsertConversation(state.conversations, item),
    selectedConversation,
  };
}

function unreadConversationPatch(
  state: ChatStore,
  event: Exclude<ChatEvent, { type: "chat.resync_required" }>,
): ChatPatch {
  if (event.type !== "chat.message.updated") {
    return {};
  }
  if (event.workspaceId !== state.workspaceId) {
    return {};
  }
  if (event.conversationId === state.selectedConversation?.id) {
    return {};
  }
  if (!isUnreadAssistantMessage(event.payload.message)) {
    return {};
  }
  return {
    unreadConversationIds: {
      ...state.unreadConversationIds,
      [event.conversationId]: true,
    },
  };
}

function isUnreadAssistantMessage(message: ChatMessage) {
  if (message.role !== "assistant") {
    return false;
  }
  return (
    message.status === "complete" || message.status === "error" || message.status === "cancelled"
  );
}

function withoutConversation(unread: Record<string, true>, conversationId: string) {
  if (!unread[conversationId]) {
    return unread;
  }
  const next = { ...unread };
  delete next[conversationId];
  return next;
}

function isSelectedConversationEvent(state: ChatStore, event: ChatEvent) {
  return (
    state.workspaceId === event.workspaceId &&
    state.selectedConversation?.id === event.conversationId
  );
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id);
  const next = index === -1 ? [...messages, message] : messages.with(index, message);
  return next.toSorted((left, right) => left.ordinal - right.ordinal);
}

function upsertConversation(
  conversations: ConversationListItem[],
  item: ConversationListItem,
): ConversationListItem[] {
  const index = conversations.findIndex(
    (current) => current.conversation.id === item.conversation.id,
  );
  const next = index === -1 ? [...conversations, item] : conversations.with(index, item);
  return next.toSorted(compareConversationListItems);
}

function compareConversationListItems(left: ConversationListItem, right: ConversationListItem) {
  if (left.conversation.updatedAt === right.conversation.updatedAt) {
    return left.conversation.id.localeCompare(right.conversation.id);
  }
  return right.conversation.updatedAt.localeCompare(left.conversation.updatedAt);
}

function unchangedEventResult(): EventApplyResult {
  return { patch: {}, resync: false };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled chat event: ${JSON.stringify(value)}`);
}
