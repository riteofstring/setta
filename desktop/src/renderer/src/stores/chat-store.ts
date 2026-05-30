import type {
  ApprovalAnswer,
  ChatEvent,
  ChatMessage,
  Conversation,
  ConversationListItem,
  Diagnostic,
  MessagePage,
  Run,
  RunItem,
  RunItemOutput,
} from "@generated/backend";
import { create } from "zustand";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "loading"
  | "loadingOlder"
  | "queueing"
  | "refreshing"
  | "sending"
  | "steering"
  | null;

interface ChatStore {
  activeRun: Run | null;
  conversations: ConversationListItem[];
  diagnostics: Diagnostic[];
  error: string | null;
  hasMoreOlder: boolean;
  handleEvent: (event: ChatEvent) => void;
  lastEventSequence: number;
  lastEventStreamId: string;
  loadOlder: () => Promise<void>;
  loadRunActivity: (runId: string, limit?: number) => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  messages: ChatMessage[];
  operation: ChatOperation;
  queueMessage: (prompt: string) => Promise<void>;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  runItemOutputs: RunItemOutput[];
  runItems: RunItem[];
  selectedConversation: Conversation | null;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (prompt: string) => Promise<void>;
  status: ChatStatus;
  steerMessage: (prompt: string) => Promise<void>;
  stopActiveRun: () => Promise<void>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
  workspaceId: string | null;
}

type ChatPatch = Partial<
  Pick<
    ChatStore,
    | "activeRun"
    | "conversations"
    | "diagnostics"
    | "error"
    | "hasMoreOlder"
    | "lastEventSequence"
    | "lastEventStreamId"
    | "messages"
    | "operation"
    | "runItemOutputs"
    | "runItems"
    | "selectedConversation"
    | "status"
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
    diagnostics: [],
    createConversation: async (title = "") => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "creating" });
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
      set({
        ...result.patch,
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
            runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.runItemOutputs),
            runItems: upsertRunItems(current.runItems, page.runItems),
            status: "ready",
          };
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    loadRunActivity: async (runId, limit = 200) => {
      const { workspaceId } = get();
      if (!workspaceId || runId === "") {
        return;
      }
      try {
        const page = await window.setta.chat.runActivity(workspaceId, runId, limit);
        set((current) => ({
          runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.output),
          runItems: upsertRunItems(current.runItems, page.items),
          status: "ready",
        }));
      } catch (error) {
        set(errorPatch(error));
      }
    },
    loadRunItemOutput: async (runId, runItemId, afterOrdinal = 0, limit = 200) => {
      const { workspaceId } = get();
      if (!workspaceId || runId === "" || runItemId === "") {
        return;
      }
      try {
        const page = await window.setta.chat.runItemOutput(
          workspaceId,
          runId,
          runItemId,
          afterOrdinal,
          limit,
        );
        set((current) => ({
          runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.output),
          status: "ready",
        }));
      } catch (error) {
        set(errorPatch(error));
      }
    },
    loadWorkspace: async (workspaceId: string) => {
      const operationId = beginOperation({
        activeRun: null,
        error: null,
        hasMoreOlder: false,
        messages: [],
        operation: "loading",
        diagnostics: [],
        runItemOutputs: [],
        runItems: [],
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
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    lastEventSequence: 0,
    lastEventStreamId: "",
    messages: [],
    operation: null,
    queueMessage: async (prompt: string) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "queueing" });
      try {
        const result = await window.setta.chat.queueMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        commitCurrent(operationId, {
          ...pagePatch(result.page, result.run.status === "running" ? result.run : activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
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
        commitCurrent(operationId, {
          ...patch,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
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
    runItemOutputs: [],
    runItems: [],
    steerMessage: async (prompt: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "steering" });
      try {
        const result = await window.setta.chat.steerMessage(
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
    runItemOutputs: page.runItemOutputs,
    runItems: page.runItems,
    selectedConversation: page.conversation,
  };
}

function emptyConversationPatch(): ChatPatch {
  return {
    activeRun: null,
    hasMoreOlder: false,
    messages: [],
    runItemOutputs: [],
    runItems: [],
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

type AppliedChatEvent = Exclude<ChatEvent, { type: "chat.resync_required" }>;
type MessageUpsertEvent = Extract<
  AppliedChatEvent,
  {
    type:
      | "chat.message.created"
      | "chat.message.queued"
      | "chat.message.steering_sent"
      | "chat.message.updated";
  }
>;
type RunItemUpsertEvent = Extract<
  AppliedChatEvent,
  { type: "chat.run_item.created" | "chat.run_item.updated" }
>;

const messageUpsertEventTypes = new Set([
  "chat.message.created",
  "chat.message.queued",
  "chat.message.steering_sent",
  "chat.message.updated",
]);

const runItemUpsertEventTypes = new Set(["chat.run_item.created", "chat.run_item.updated"]);

function applyChatEvent(state: ChatStore, event: AppliedChatEvent): EventApplyResult {
  if (isMessageUpsertEvent(event)) {
    return applyMessageUpsertEvent(state, event);
  }
  if (isRunItemUpsertEvent(event)) {
    return applyRunItemUpsertEvent(state, event);
  }
  if (event.type === "chat.assistant_text_delta") {
    return applyAssistantTextDelta(state, event);
  }
  if (event.type === "chat.run.updated") {
    return selectedConversationEventResult(state, event, {
      activeRun: event.payload.run,
      status: "ready",
    });
  }
  if (event.type === "chat.run_item_output.delta") {
    return selectedConversationEventResult(state, event, {
      runItemOutputs: upsertRunItemOutput(state.runItemOutputs, event.payload.output),
      status: "ready",
    });
  }
  if (event.type === "chat.queue.updated") {
    return selectedConversationEventResult(state, event, {
      messages: mergeQueueMessages(state.messages, event.payload.queue.messages),
      status: "ready",
    });
  }
  if (event.type === "chat.conversation.updated") {
    return workspaceEventResult(state, event, conversationUpdatedPatch(state, event.payload.item));
  }
  if (event.type === "diagnostic.created") {
    return workspaceEventResult(state, event, {
      diagnostics: upsertDiagnostic(state.diagnostics, event.payload.diagnostic),
      status: "ready",
    });
  }
  return assertNever(event);
}

function isMessageUpsertEvent(event: AppliedChatEvent): event is MessageUpsertEvent {
  return messageUpsertEventTypes.has(event.type);
}

function isRunItemUpsertEvent(event: AppliedChatEvent): event is RunItemUpsertEvent {
  return runItemUpsertEventTypes.has(event.type);
}

function applyMessageUpsertEvent(state: ChatStore, event: MessageUpsertEvent): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    messages: upsertMessage(state.messages, event.payload.message),
    status: "ready",
  });
}

function applyRunItemUpsertEvent(state: ChatStore, event: RunItemUpsertEvent): EventApplyResult {
  return selectedConversationEventResult(state, event, {
    runItems: upsertRunItem(state.runItems, event.payload.item),
    status: "ready",
  });
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

function mergeQueueMessages(messages: ChatMessage[], queuedMessages: ChatMessage[]): ChatMessage[] {
  return queuedMessages.reduce(upsertMessage, messages);
}

function upsertRunItems(items: RunItem[], nextItems: RunItem[]): RunItem[] {
  return nextItems.reduce(upsertRunItem, items);
}

function upsertRunItem(items: RunItem[], item: RunItem): RunItem[] {
  const index = items.findIndex((current) => current.id === item.id);
  const next = index === -1 ? [...items, item] : items.with(index, item);
  return next.toSorted(compareRunItems);
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function upsertRunItemOutputs(
  outputs: RunItemOutput[],
  nextOutputs: RunItemOutput[],
): RunItemOutput[] {
  return nextOutputs.reduce(upsertRunItemOutput, outputs);
}

function upsertRunItemOutput(outputs: RunItemOutput[], output: RunItemOutput): RunItemOutput[] {
  const index = outputs.findIndex((current) => current.id === output.id);
  const next = index === -1 ? [...outputs, output] : outputs.with(index, output);
  return next.toSorted(compareRunItemOutputs);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
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

function upsertDiagnostic(diagnostics: Diagnostic[], diagnostic: Diagnostic): Diagnostic[] {
  const index = diagnostics.findIndex((current) => current.id === diagnostic.id);
  const next = index === -1 ? [...diagnostics, diagnostic] : diagnostics.with(index, diagnostic);
  return next.toSorted(compareDiagnostics).slice(-10);
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic) {
  if (left.occurredAt === right.occurredAt) {
    return left.id.localeCompare(right.id);
  }
  return left.occurredAt.localeCompare(right.occurredAt);
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
