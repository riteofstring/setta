import type {
  ApprovalAnswer,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  ListConversationsResponse,
  MessagePage,
  ReasoningEffort,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";
import { create } from "zustand";

import { applyChatEvent } from "./chat-events";
import {
  activeRunFromCandidate,
  activeRunAfterOperation,
  activeRunFromCandidates,
  activeRunFromPage,
  messagesFromPage,
  mergeOperationMessages,
  mergeOperationTranscript,
  normalizeChatPatch,
  outputPageLoadedState,
  prependOlderMessages,
  prependOlderTranscript,
  queuedRunsFromPage,
  terminalRunIdsAfterOperation,
  terminalRunIdsFromTranscript,
  type QueuedRun,
  type RunItemOutputPageState,
  type RunningRun,
  updateRunItemOutputPageState,
  upsertConversationListItem,
  upsertRunItemOutputs,
  upsertRunItems,
} from "./chat-store-normalization";

export { prependOlderMessages };
export type { RunItemOutputPageState } from "./chat-store-normalization";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "editingQueued"
  | "commanding"
  | "loading"
  | "loadingOlder"
  | "queueing"
  | "removingQueued"
  | "refreshing"
  | "sending"
  | "sendingSteeringImmediately"
  | "steering"
  | null;

export interface ChatStore {
  activeRun: RunningRun | null;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
  editingQueuedMessageId: string | null;
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  error: string | null;
  goal: ChatGoalState | null;
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
  markConversationRead: (conversationId: string) => Promise<void>;
  messageIds: string[];
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage>;
  olderBeforeOrdinal: number;
  operation: ChatOperation;
  queuedRuns: QueuedRun[];
  queueMessage: (prompt: string) => Promise<void>;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  executeCommand: (
    raw: string,
    options?: ChatCommandExecutionOptions,
  ) => Promise<ChatCommandExecuteResult>;
  setCodexModel: (modelId: string) => Promise<ChatCommandExecuteResult>;
  setCodexReasoningEffort: (effort: ReasoningEffort) => Promise<ChatCommandExecuteResult>;
  listCommands: () => Promise<ChatCommandListResult | null>;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput>;
  runItems: RunItem[];
  runItemsById: Record<string, RunItem>;
  selectedConversation: Conversation | null;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (prompt: string) => Promise<void>;
  sendSteeringImmediately: (prompt?: string) => Promise<void>;
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
  transcript: TranscriptTurn[];
}

export type ChatPatch = Partial<
  Pick<
    ChatStore,
    | "activeRun"
    | "conversations"
    | "corruption"
    | "diagnostics"
    | "editingQueuedMessageId"
    | "error"
    | "goal"
    | "hasMoreOlder"
    | "lastEventSequence"
    | "lastEventStreamId"
    | "messageIds"
    | "messages"
    | "messagesById"
    | "olderBeforeOrdinal"
    | "operation"
    | "queuedRuns"
    | "removingQueuedMessageId"
    | "runItemIdsByRunId"
    | "runItemOutputIdsByRunItemId"
    | "runItemOutputPagesByRunItemId"
    | "runItemOutputs"
    | "runItemOutputsById"
    | "runItems"
    | "runItemsById"
    | "selectedConversation"
    | "status"
    | "transcript"
    | "workspaceId"
  >
>;

const pageLimit = 40;
const emptyCorruption: CorruptionSummary = {
  byKind: [],
  bySeverity: [],
  hasCorruption: false,
  total: 0,
};
let operationSequence = 0;
let currentOperationId = 0;

export const useChatStore = create<ChatStore>((set, get) => {
  function beginOperation(patch: ChatPatch) {
    operationSequence += 1;
    currentOperationId = operationSequence;
    set(normalizeChatPatch(patch));
    return currentOperationId;
  }

  function commitCurrent(operationId: number, patch: ChatPatch) {
    if (operationId !== currentOperationId) {
      return;
    }
    currentOperationId = 0;
    set(normalizeChatPatch(patch));
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
    set(normalizeChatPatch(patch));
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
    corruption: emptyCorruption,
    diagnostics: [],
    editingQueuedMessageId: null,
    goal: null,
    editQueuedMessage: async (messageId: string, prompt: string) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({
        editingQueuedMessageId: messageId,
        error: null,
        operation: "editingQueued",
      });
      try {
        const result = await window.setta.chat.editQueuedMessage(
          workspaceId,
          selectedConversation.id,
          messageId,
          prompt,
        );
        commitCurrentFromState(operationId, (current) => ({
          ...operationPagePatch(current, result.page, result.run, activeRun),
          editingQueuedMessageId: null,
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, {
          ...errorPatch(error),
          editingQueuedMessageId: null,
        });
        throw error;
      }
    },
    createConversation: async (title = "") => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      await get().createWorkspaceConversation(workspaceId, title);
    },
    createWorkspaceConversation: async (workspaceId, title = "") => {
      const switchingWorkspace = get().workspaceId !== workspaceId;
      const operationId = beginOperation({ error: null, operation: "creating" });
      try {
        const conversation = await window.setta.chat.createConversation(workspaceId, title);
        const patch = await loadConversationPage(workspaceId, conversation);
        const listPatch = await reloadConversationsPatch(workspaceId);
        commitCurrent(operationId, {
          ...patch,
          ...listPatch,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, {
          ...errorPatch(error),
          workspaceId: switchingWorkspace ? workspaceId : get().workspaceId,
        });
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
        ...normalizeChatPatch(result.patch),
        lastEventSequence: event.sequence,
        lastEventStreamId: event.streamId,
      });
      if (result.resync) {
        void get().resyncActiveConversation();
      }
    },
    loadOlder: async () => {
      const { olderBeforeOrdinal, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation || olderBeforeOrdinal <= 0 || !get().hasMoreOlder) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "loadingOlder" });
      try {
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          olderBeforeOrdinal,
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
            messages: prependOlderMessages(messagesFromPage(page), current.messages),
            olderBeforeOrdinal: page.olderBeforeOrdinal,
            operation: null,
            runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.runItemOutputs),
            runItems: upsertRunItems(current.runItems, page.runItems),
            status: "ready",
            transcript: prependOlderTranscript(page.transcript, current.transcript),
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
        set((current) =>
          normalizeChatPatch({
            runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.output),
            runItems: upsertRunItems(current.runItems, page.items),
            status: "ready",
          }),
        );
      } catch (error) {
        set(errorPatch(error));
      }
    },
    loadRunItemOutput: async (runId, runItemId, afterOrdinal = 0, limit = 200) => {
      const { workspaceId } = get();
      if (!workspaceId || runId === "" || runItemId === "") {
        return;
      }
      set((current) =>
        normalizeChatPatch({
          runItemOutputPagesByRunItemId: updateRunItemOutputPageState(
            current.runItemOutputPagesByRunItemId,
            runItemId,
            { error: null, loading: true },
          ),
        }),
      );
      try {
        const page = await window.setta.chat.runItemOutput(
          workspaceId,
          runId,
          runItemId,
          afterOrdinal,
          limit,
        );
        set((current) =>
          normalizeChatPatch({
            runItemOutputPagesByRunItemId: updateRunItemOutputPageState(
              current.runItemOutputPagesByRunItemId,
              runItemId,
              outputPageLoadedState(page.output, afterOrdinal, page.hasMore, page.nextOrdinal),
            ),
            runItemOutputs: upsertRunItemOutputs(current.runItemOutputs, page.output),
            status: "ready",
          }),
        );
      } catch (error) {
        set((current) =>
          normalizeChatPatch({
            ...errorPatch(error),
            runItemOutputPagesByRunItemId: updateRunItemOutputPageState(
              current.runItemOutputPagesByRunItemId,
              runItemId,
              { error: errorMessage(error), loading: false },
            ),
          }),
        );
      }
    },
    loadWorkspace: async (workspaceId: string) => {
      const operationId = beginOperation({
        activeRun: null,
        error: null,
        corruption: emptyCorruption,
        diagnostics: [],
        editingQueuedMessageId: null,
        hasMoreOlder: false,
        goal: null,
        messages: [],
        olderBeforeOrdinal: 0,
        operation: "loading",
        runItemOutputPagesByRunItemId: {},
        runItemOutputs: [],
        runItems: [],
        queuedRuns: [],
        removingQueuedMessageId: null,
        selectedConversation: null,
        status: "loading",
        transcript: [],
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
          ...listPatch(list),
          operation: null,
          selectedConversation: first,
          status: "ready",
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    lastEventSequence: 0,
    lastEventStreamId: "",
    markConversationRead: async (conversationId: string) => {
      const { workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      try {
        const item = await window.setta.chat.markConversationRead(workspaceId, conversationId);
        set((current) =>
          normalizeChatPatch({
            conversations: upsertConversationListItem(current.conversations, item),
            selectedConversation:
              current.selectedConversation?.id === item.conversation.id
                ? item.conversation
                : current.selectedConversation,
          }),
        );
      } catch (error) {
        set({ error: errorMessage(error), status: "error" });
      }
    },
    messageIds: [],
    messages: [],
    messagesById: {},
    olderBeforeOrdinal: 0,
    operation: null,
    queuedRuns: [],
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
        commitCurrentFromState(operationId, (current) => ({
          ...operationPagePatch(current, result.page, result.run, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    removeQueuedMessage: async (messageId: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({
        error: null,
        operation: "removingQueued",
        removingQueuedMessageId: messageId,
      });
      try {
        const result = await window.setta.chat.removeQueuedMessage(
          workspaceId,
          selectedConversation.id,
          messageId,
        );
        commitCurrentFromState(operationId, (current) => ({
          ...pagePatch(result.page, activeRunFromPage(result.page) ?? current.activeRun),
          operation: null,
          removingQueuedMessageId: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, {
          ...errorPatch(error),
          removingQueuedMessageId: null,
        });
        throw error;
      }
    },
    removingQueuedMessageId: null,
    executeCommand: async (raw: string, options?: ChatCommandExecutionOptions) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operationId = beginOperation({ error: null, operation: "commanding" });
      try {
        const result =
          options === undefined
            ? await window.setta.chat.executeCommand(workspaceId, selectedConversation.id, raw)
            : await window.setta.chat.executeCommand(
                workspaceId,
                selectedConversation.id,
                raw,
                options,
              );
        commitCurrentFromState(operationId, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    setCodexModel: async (modelId: string) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operationId = beginOperation({ error: null, operation: "commanding" });
      try {
        const result = await window.setta.chat.setCodexModel(
          workspaceId,
          selectedConversation.id,
          modelId,
        );
        commitCurrentFromState(operationId, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    setCodexReasoningEffort: async (effort: ReasoningEffort) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operationId = beginOperation({ error: null, operation: "commanding" });
      try {
        const result = await window.setta.chat.setCodexReasoningEffort(
          workspaceId,
          selectedConversation.id,
          effort,
        );
        commitCurrentFromState(operationId, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    listCommands: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return null;
      }
      return window.setta.chat.listCommands(workspaceId, selectedConversation.id);
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
          ...listPatch(list),
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
        commitCurrentFromState(operationId, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    sendSteeringImmediately: async (prompt?: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "sendingSteeringImmediately" });
      try {
        const result = await window.setta.chat.sendSteeringImmediately(
          workspaceId,
          selectedConversation.id,
          prompt ?? "",
        );
        commitCurrentFromState(operationId, (current) => ({
          ...operationPagePatch(current, result.page, result.activeRun, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
        throw error;
      }
    },
    status: "idle",
    runItemOutputs: [],
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputsById: {},
    runItems: [],
    runItemIdsByRunId: {},
    runItemsById: {},
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
        commitCurrentFromState(operationId, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
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
          activeRun: activeRunFromCandidate(run),
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
          activeRun: activeRunFromCandidate(run),
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    transcript: [],
    workspaceId: null,
  };
});

async function reloadConversationsPatch(workspaceId: string): Promise<ChatPatch> {
  const list = await window.setta.chat.listConversations(workspaceId);
  return listPatch(list);
}

function listPatch(list: ListConversationsResponse): ChatPatch {
  return {
    conversations: list.conversations,
    corruption: list.corruption,
    diagnostics: list.diagnostics,
  };
}

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
  return normalizeChatPatch({
    activeRun: activeRunFromCandidate(activeRun),
    goal: page.goal,
    hasMoreOlder: page.hasMoreOlder,
    messages: messagesFromPage(page),
    olderBeforeOrdinal: page.olderBeforeOrdinal,
    queuedRuns: queuedRunsFromPage(page),
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: page.runItemOutputs,
    runItems: page.runItems,
    selectedConversation: page.conversation,
    transcript: page.transcript,
  });
}

function operationPagePatch(
  current: ChatStore,
  page: MessagePage,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsAfterOperation(current.transcript, returnedRun);
  const activeRun = activeRunAfterOperation(
    current.activeRun,
    returnedRun,
    fallbackActiveRun,
    terminalRunIds,
  );
  return terminalPreservingPagePatch(current, page, activeRun, terminalRunIds);
}

function commandOperationPatch(
  current: ChatStore,
  result: ChatCommandExecuteResult,
  fallbackActiveRun: RunningRun | null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsFromTranscript(current.transcript);
  return terminalPreservingPagePatch(
    current,
    result.page,
    activeRunFromCandidates(
      terminalRunIds,
      activeRunFromPage(result.page),
      current.activeRun,
      fallbackActiveRun,
    ),
    terminalRunIds,
  );
}

function terminalPreservingPagePatch(
  current: ChatStore,
  page: MessagePage,
  activeRun: RunningRun | null,
  terminalRunIds: Set<string>,
): ChatPatch {
  const patch = pagePatch(
    {
      ...page,
      transcript: mergeOperationTranscript(current.transcript, page.transcript, terminalRunIds),
    },
    activeRun,
  );
  if (patch.messages) {
    patch.messages = mergeOperationMessages(current.messages, patch.messages, terminalRunIds);
  }
  return patch;
}

function emptyConversationPatch(): ChatPatch {
  return normalizeChatPatch({
    activeRun: null,
    editingQueuedMessageId: null,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeOrdinal: 0,
    queuedRuns: [],
    removingQueuedMessageId: null,
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runItems: [],
    selectedConversation: null,
    transcript: [],
  });
}

function errorPatch(error: unknown): ChatPatch {
  return {
    error: errorMessage(error),
    operation: null,
    status: "error",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Chat operation failed";
}
