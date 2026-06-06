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
  ReasoningEffort,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";
import { create } from "zustand";

import { applyChatEvent } from "./chat-events";
import {
  conversationListErrorPatch,
  conversationListLoadedPatch,
  conversationListLoadingPatch,
  conversationUpdatedSummaryPatch,
  type WorkspaceConversationListState,
} from "./chat-store-conversation-lists";
import {
  conversationDetailPatch,
  normalizeStatePatch,
  type ConversationDetailState,
} from "./chat-store-detail-cache";
import {
  activeRunFromPage,
  messagesFromPage,
  outputPageLoadedState,
  prependOlderMessages,
  prependOlderTranscript,
  type QueuedRun,
  type RunItemOutputPageState,
  type RunningRun,
  updateRunItemOutputPageState,
  upsertRunItemOutputs,
  upsertRunItems,
} from "./chat-store-normalization";
import {
  commandOperationPatch,
  emptyConversationPatch,
  operationPagePatch,
  pagePatch,
  resyncPagePatch,
  runOperationPatch,
} from "./chat-store-page-patches";
import {
  conversationBoundOperationScopes,
  createChatOperationTracker,
  type ChatOperation,
  type ChatOperationScope,
  type ChatOperationToken,
} from "./chat-store-operations";
import {
  conversationSelectionRequest,
  emptyCorruption,
  findConversation,
  missingConversationPatch,
  type ConversationSelectionRequest,
  type ConversationSelectionResult,
} from "./chat-store-workspace-selection";

export { prependOlderMessages };
export type { WorkspaceConversationListState } from "./chat-store-conversation-lists";
export type { RunItemOutputPageState } from "./chat-store-normalization";

type ChatStatus = "idle" | "loading" | "ready" | "error";

export interface ChatStore {
  activeRun: RunningRun | null;
  applyConversationList: (workspaceId: string, response: ListConversationsResponse) => void;
  applyConversationUpdatedEvent: (workspaceId: string, item: ConversationListItem) => void;
  clearClosedWorkspaceConversationLists: (activeWorkspaceIds: string[]) => void;
  conversationDetailsById: Record<string, ConversationDetailState | undefined>;
  conversationListsByWorkspaceId: Record<string, WorkspaceConversationListState | undefined>;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
  editingQueuedMessageId: string | null;
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  ensureWorkspaceConversationList: (workspaceId: string) => Promise<void>;
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
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
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
    | "conversationDetailsById"
    | "conversationListsByWorkspaceId"
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

export const useChatStore = create<ChatStore>((set, get) => {
  const operations = createChatOperationTracker();

  function beginOperation(
    scope: ChatOperationScope,
    patch: ChatPatch,
    cancelScopes: ChatOperationScope[] = [],
  ): ChatOperationToken {
    const token = operations.begin(scope, cancelScopes);
    set((current) => normalizeStatePatch(current, operations.beginPatch(scope, patch)));
    return token;
  }

  function commitCurrent(token: ChatOperationToken, patch: ChatPatch) {
    const nextPatch = operations.completePatch(token, patch);
    if (!nextPatch) {
      return;
    }
    set((current) => normalizeStatePatch(current, nextPatch));
  }

  function commitCurrentFromState(
    token: ChatOperationToken,
    patchForState: (state: ChatStore) => ChatPatch,
  ) {
    if (!operations.isCurrent(token)) {
      return;
    }
    set((current) => {
      if (!operations.isCurrent(token)) {
        return {};
      }
      const patch = patchForState(current);
      const nextPatch = operations.completePatch(token, patch);
      if (!nextPatch) {
        return {};
      }
      return normalizeStatePatch(current, nextPatch);
    });
  }

  async function loadConversationPageSnapshot(workspaceId: string, conversation: Conversation) {
    const page = await window.setta.chat.messagePage(workspaceId, conversation.id, 0, pageLimit);
    const active = await window.setta.chat.activeRun(workspaceId, conversation.id);
    return {
      activeRun: active.hasActiveRun ? active.run : null,
      page,
    };
  }

  async function loadConversationPage(workspaceId: string, conversation: Conversation) {
    const snapshot = await loadConversationPageSnapshot(workspaceId, conversation);
    return pagePatch(snapshot.page, snapshot.activeRun);
  }

  async function reloadConversations(workspaceId: string) {
    return window.setta.chat.listConversations(workspaceId);
  }

  async function resolveConversationSelection(
    request: ConversationSelectionRequest,
  ): Promise<ConversationSelectionResult> {
    if (request.conversation) {
      return { conversation: request.conversation, conversationListPatch: {} };
    }
    const list = await reloadConversations(request.workspaceId);
    return {
      conversation: findConversation(list.conversations, request.conversationId),
      conversationListPatch: conversationListLoadedPatch(get(), request.workspaceId, list, true),
    };
  }

  return {
    activeRun: null,
    applyConversationList: (workspaceId, response) => {
      set((current) =>
        normalizeStatePatch(
          current,
          conversationListLoadedPatch(
            current,
            workspaceId,
            response,
            current.workspaceId === workspaceId,
          ),
        ),
      );
    },
    applyConversationUpdatedEvent: (workspaceId, item) => {
      set((current) =>
        normalizeStatePatch(current, conversationUpdatedSummaryPatch(current, workspaceId, item)),
      );
    },
    clearClosedWorkspaceConversationLists: (activeWorkspaceIds) => {
      const activeIds = new Set(activeWorkspaceIds);
      set((current) => {
        const next = Object.fromEntries(
          Object.entries(current.conversationListsByWorkspaceId).filter(([workspaceId]) =>
            activeIds.has(workspaceId),
          ),
        );
        if (
          Object.keys(next).length === Object.keys(current.conversationListsByWorkspaceId).length
        ) {
          return {};
        }
        const patch: ChatPatch = { conversationListsByWorkspaceId: next };
        if (current.workspaceId && !activeIds.has(current.workspaceId)) {
          Object.assign(patch, {
            conversations: [],
            corruption: emptyCorruption,
            diagnostics: [],
          });
        }
        return normalizeStatePatch(current, patch);
      });
    },
    conversationListsByWorkspaceId: {},
    conversationDetailsById: {},
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
      const operation = beginOperation("queueMutation", {
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
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, activeRun),
          editingQueuedMessageId: null,
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, {
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
      const operation = beginOperation(
        "conversation",
        { error: null, operation: "creating" },
        conversationBoundOperationScopes,
      );
      try {
        const conversation = await window.setta.chat.createConversation(workspaceId, title);
        const patch = await loadConversationPage(workspaceId, conversation);
        const list = await reloadConversations(workspaceId);
        commitCurrentFromState(operation, (current) => ({
          ...patch,
          ...conversationListLoadedPatch(current, workspaceId, list, true),
          operation: null,
          selectedConversation: conversation,
          status: "ready",
          workspaceId,
        }));
      } catch (error) {
        commitCurrent(operation, {
          ...errorPatch(error),
          workspaceId: switchingWorkspace ? workspaceId : get().workspaceId,
        });
      }
    },
    error: null,
    ensureWorkspaceConversationList: async (workspaceId: string) => {
      const existing = get().conversationListsByWorkspaceId[workspaceId];
      if (existing?.loading || (existing && existing.error === null)) {
        return;
      }
      set((current) =>
        normalizeStatePatch(
          current,
          conversationListLoadingPatch(current, workspaceId, current.workspaceId === workspaceId),
        ),
      );
      try {
        const list = await reloadConversations(workspaceId);
        get().applyConversationList(workspaceId, list);
      } catch (error) {
        set((current) =>
          normalizeStatePatch(
            current,
            conversationListErrorPatch(
              current,
              workspaceId,
              errorMessage(error),
              current.workspaceId === workspaceId,
            ),
          ),
        );
      }
    },
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
      set((current) => ({
        ...normalizeStatePatch(current, result.patch),
        lastEventSequence: event.sequence,
        lastEventStreamId: event.streamId,
      }));
      if (result.resync) {
        void get().resyncActiveConversation();
      }
    },
    loadOlder: async () => {
      const { olderBeforeOrdinal, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation || olderBeforeOrdinal <= 0 || !get().hasMoreOlder) {
        return;
      }
      const operation = beginOperation("pagination", { error: null, operation: "loadingOlder" });
      try {
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          olderBeforeOrdinal,
          pageLimit,
        );
        commitCurrentFromState(operation, (current) => {
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
        commitCurrent(operation, errorPatch(error));
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
          normalizeStatePatch(current, {
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
        normalizeStatePatch(current, {
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
          normalizeStatePatch(current, {
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
          normalizeStatePatch(current, {
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
      const operation = beginOperation(
        "conversation",
        {
          error: null,
          operation: "loading",
          status: "loading",
        },
        conversationBoundOperationScopes,
      );
      try {
        const list = await reloadConversations(workspaceId);
        const first = list.conversations[0]?.conversation ?? null;
        const patch = first
          ? await loadConversationPage(workspaceId, first)
          : emptyConversationPatch();
        commitCurrentFromState(operation, (current) => ({
          ...patch,
          ...conversationListLoadedPatch(current, workspaceId, list, true),
          operation: null,
          selectedConversation: first,
          status: "ready",
          workspaceId,
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
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
          normalizeStatePatch(current, conversationUpdatedSummaryPatch(current, workspaceId, item)),
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
      const operation = beginOperation("queueMutation", { error: null, operation: "queueing" });
      try {
        const result = await window.setta.chat.queueMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    removeQueuedMessage: async (messageId: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operation = beginOperation("queueMutation", {
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
        commitCurrentFromState(operation, (current) => ({
          ...pagePatch(result.page, activeRunFromPage(result.page) ?? current.activeRun),
          operation: null,
          removingQueuedMessageId: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, {
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
      const operation = beginOperation("commandMutation", { error: null, operation: "commanding" });
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
        commitCurrentFromState(operation, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
        throw error;
      }
    },
    setCodexModel: async (modelId: string) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operation = beginOperation("commandMutation", { error: null, operation: "commanding" });
      try {
        const result = await window.setta.chat.setCodexModel(
          workspaceId,
          selectedConversation.id,
          modelId,
        );
        commitCurrentFromState(operation, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
        throw error;
      }
    },
    setCodexReasoningEffort: async (effort: ReasoningEffort) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operation = beginOperation("commandMutation", { error: null, operation: "commanding" });
      try {
        const result = await window.setta.chat.setCodexReasoningEffort(
          workspaceId,
          selectedConversation.id,
          effort,
        );
        commitCurrentFromState(operation, (current) => ({
          ...commandOperationPatch(current, result, activeRun),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
        return result;
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
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
      const operation = beginOperation("eventResync", { error: null, operation: "refreshing" });
      try {
        const list = await reloadConversations(workspaceId);
        const nextConversation = selectedConversation
          ? (list.conversations.find((item) => item.conversation.id === selectedConversation.id)
              ?.conversation ?? selectedConversation)
          : (list.conversations[0]?.conversation ?? null);
        const snapshot = nextConversation
          ? await loadConversationPageSnapshot(workspaceId, nextConversation)
          : null;
        commitCurrentFromState(operation, (current) => ({
          ...(snapshot
            ? resyncPagePatch(current, snapshot.page, snapshot.activeRun)
            : emptyConversationPatch()),
          ...conversationListLoadedPatch(current, workspaceId, list, true),
          operation: null,
          selectedConversation: nextConversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    selectConversation: async (conversationId: string, targetWorkspaceId?: string) => {
      const request = conversationSelectionRequest(get(), conversationId, targetWorkspaceId);
      if (!request) {
        return;
      }
      const cachedDetail = get().conversationDetailsById[conversationId];
      const loadingPatch =
        cachedDetail?.conversation.workspaceId === request.workspaceId
          ? {
              ...request.loadingPatch,
              ...conversationDetailPatch(cachedDetail),
              error: null,
              operation: "loading" as const,
              status: "loading" as const,
              workspaceId: request.workspaceId,
            }
          : request.loadingPatch;
      const operation = beginOperation(
        "conversation",
        loadingPatch,
        conversationBoundOperationScopes,
      );
      try {
        const { conversation, conversationListPatch } = await resolveConversationSelection(request);
        if (!conversation) {
          commitCurrent(operation, missingConversationPatch(request, conversationListPatch));
          return;
        }
        const patch = await loadConversationPage(request.workspaceId, conversation);
        commitCurrent(operation, {
          ...conversationListPatch,
          ...patch,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
          workspaceId: request.workspaceId,
        });
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    selectedConversation: null,
    sendMessage: async (prompt: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operation = beginOperation("messageMutation", { error: null, operation: "sending" });
      try {
        const result = await window.setta.chat.sendMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    sendSteeringImmediately: async (prompt?: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operation = beginOperation("messageMutation", {
        error: null,
        operation: "sendingSteeringImmediately",
      });
      try {
        const result = await window.setta.chat.sendSteeringImmediately(
          workspaceId,
          selectedConversation.id,
          prompt ?? "",
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.activeRun, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
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
      const operation = beginOperation("messageMutation", { error: null, operation: "steering" });
      try {
        const result = await window.setta.chat.steerMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    stopActiveRun: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operation = beginOperation("runMutation", { error: null, operation: "cancelling" });
      try {
        const run = await window.setta.chat.cancelRun(workspaceId, selectedConversation.id);
        commitCurrentFromState(operation, (current) => ({
          ...runOperationPatch(current, run),
          operation: null,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    submitApproval: async (approvalId, approved, response, answers, cancelled) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operation = beginOperation("approvalMutation", { error: null, operation: "approving" });
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
        commitCurrentFromState(operation, (current) => ({
          ...runOperationPatch(current, run),
          operation: null,
          status: "ready",
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    transcript: [],
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
