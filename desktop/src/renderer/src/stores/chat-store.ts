import type {
  ChatInput,
  ChatPermissionPresetID,
  Conversation,
  ListConversationsResponse,
  ReasoningEffort,
} from "@generated/backend";
import type { BackendProcessStatus, ChatCommandExecutionOptions } from "@shared/types";
import { create } from "zustand";

import { applyChatEvent } from "./chat-events";
import { createChatAttachmentActions } from "./chat-store-attachment-actions";
import { createChatBackgroundTerminalActions } from "./chat-store-background-terminal-actions";
import { backgroundTerminalsReplacedPatch } from "./chat-store-background-terminals";
import {
  createListComposerPromptHistoryAction,
  createSetConversationPinnedAction,
} from "./chat-store-conversation-actions";
import {
  conversationListErrorPatch,
  conversationListLoadedPatch,
  conversationListLoadingPatch,
  conversationUpdatedSummaryPatch,
} from "./chat-store-conversation-lists";
import { runChatBackgroundAction, type ChatBackgroundActionName } from "./chat-background-actions";
import { ChatBackendLifecycleAbort } from "./chat-store-backend-lifecycle";
import {
  cacheableCommandDescriptors,
  commandDescriptorCacheKey,
  commandListContextMatches,
  loadedCommandListPatch,
  staleCommandListPatch,
} from "./chat-store-command-cache";
import { createCommandMutationRunner } from "./chat-store-command-actions";
import { conversationDetailPatch, normalizeStatePatch } from "./chat-store-detail-cache";
import {
  blocksFromPage,
  messagesFromPage,
  outputPageLoadedState,
  prependOlderBlocks,
  prependOlderMessages,
  updateRunItemOutputPageState,
  upsertRunItemOutputs,
} from "./chat-store-normalization";
import {
  emptyConversationPatch,
  operationPagePatch,
  pagePatch,
  runOperationPatch,
} from "./chat-store-page-patches";
import { loadConversationPageSnapshot as loadConversationPageSnapshotRequest } from "./chat-store-page-snapshot";
import {
  conversationBoundOperationScopes,
  createChatOperationTracker,
  type ChatOperationScope,
  type ChatOperationToken,
} from "./chat-store-operations";
import {
  conversationSelectionRequest,
  emptyCorruption,
  missingConversationPatch,
} from "./chat-store-workspace-selection";
import {
  conversationToLoadForWorkspace,
  errorMessage,
  errorPatch,
  hasSequenceGap,
  isDuplicateEvent,
  isUnexpectedStream,
  persistSelectedConversation,
} from "./chat-store-helpers";
import type { ChatCommandClientOptions, ChatPatch, ChatStore } from "./chat-store-types";
import { createChatResyncController } from "./chat-store-resync";
import { createRetryActiveRunLivenessAction } from "./chat-store-liveness-actions";
import { deletedConversationSelectionPatch as deletedConversationSelectionPatchForState } from "./chat-store-delete-selection";
import { resolveConversationSelection } from "./chat-store-selection-resolver";
import {
  createChatStreamEventBatcher,
  isBufferedStreamEvent,
  type BufferedStreamChatEvent,
} from "./chat-store-stream-event-batcher";

export { prependOlderMessages };
export type { WorkspaceConversationListState } from "./chat-store-conversation-lists";
export type { RunItemOutputPageState } from "./chat-store-normalization";
export type { ChatPatch, ChatStore } from "./chat-store-types";

const pageLimit = 40;

export const useChatStore = create<ChatStore>((set, get) => {
  const operations = createChatOperationTracker();
  let backendOnline = true;
  let backendGeneration = 0;
  let commandListRequestID = 0;
  const streamEventBatcher = createChatStreamEventBatcher(flushStreamEventBatch);

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

  function backendReadGeneration(): number {
    if (!backendOnline) {
      throw new ChatBackendLifecycleAbort();
    }
    return backendGeneration;
  }

  function assertBackendReadCurrent(generation: number) {
    if (!backendOnline || generation !== backendGeneration) {
      throw new ChatBackendLifecycleAbort();
    }
  }

  function cancelEventResyncOperation(patch: ChatPatch = {}) {
    set((current) => normalizeStatePatch(current, operations.cancelScopes(["eventResync"], patch)));
  }

  function updateBackendLifecycle(status: BackendProcessStatus) {
    const wasOnline = backendOnline;
    backendGeneration += 1;
    backendOnline = status.status === "online";
    if (!backendOnline) {
      streamEventBatcher.clear();
      resync.clearQueuedResync();
      cancelEventResyncOperation({});
      return;
    }
    if (!wasOnline && get().workspaceId) {
      runChatStoreBackgroundResync("backend-lifecycle-resync");
    }
  }

  function runChatStoreBackgroundResync(name: ChatBackgroundActionName) {
    runChatBackgroundAction(name, () => get().resyncActiveConversation());
  }

  const backgroundTerminalActions = createChatBackgroundTerminalActions({
    applyPatch: (patchForState) => {
      set((current) => normalizeStatePatch(current, patchForState(current)));
    },
    get,
  });
  const attachmentActions = createChatAttachmentActions(get);

  function flushStreamEventBatch(events: BufferedStreamChatEvent[]) {
    let needsResync = false;
    set((current) => {
      let next = current;
      for (const event of events) {
        const result = applyChatEvent(next, event);
        const patch = normalizeStatePatch(next, {
          ...result.patch,
          lastEventSequence: event.sequence,
          lastEventStreamId: event.streamId,
        });
        next = { ...next, ...patch };
        needsResync = needsResync || result.resync;
      }
      return next;
    });
    if (needsResync) {
      runChatStoreBackgroundResync("event-stream-resync");
    }
  }

  async function loadConversationPageSnapshot(
    workspaceId: string,
    conversation: Conversation,
    generation = backendReadGeneration(),
  ) {
    return loadConversationPageSnapshotRequest({
      assertBackendReadCurrent,
      conversation,
      generation,
      pageLimit,
      workspaceId,
    });
  }

  async function loadConversationPage(workspaceId: string, conversation: Conversation) {
    const snapshot = await loadConversationPageSnapshot(workspaceId, conversation);
    return {
      ...pagePatch(snapshot.page, snapshot.activeRun, snapshot.activeRunLiveness),
      ...backgroundTerminalsReplacedPatch(
        get(),
        conversation.id,
        snapshot.backgroundTerminals.terminals,
      ),
    };
  }

  async function reloadConversations(workspaceId: string, generation = backendReadGeneration()) {
    assertBackendReadCurrent(generation);
    const list = await window.setta.chat.listConversations(workspaceId);
    assertBackendReadCurrent(generation);
    return list;
  }

  const resync = createChatResyncController({
    assertBackendReadCurrent,
    backendOnline: () => backendOnline,
    backendReadGeneration,
    beginOperation,
    cancelEventResyncOperation,
    commitCurrent,
    commitCurrentFromState,
    get,
    loadConversationPageSnapshot,
    reloadConversations,
  });
  const runCommandMutation = createCommandMutationRunner({
    beginOperation,
    commitCurrent,
    commitCurrentFromState,
    get,
  });

  async function deletedConversationSelectionPatch(
    workspaceId: string,
    conversationId: string,
    list: ListConversationsResponse,
  ) {
    return deletedConversationSelectionPatchForState({
      conversationId,
      list,
      loadConversationPage,
      state: get(),
      workspaceId,
    });
  }

  async function loadWorkspaceCommand(workspaceId: string) {
    const operation = beginOperation(
      "conversation",
      {
        error: null,
        operation: "loading",
        pendingGoalSubmission: null,
        status: "loading",
      },
      conversationBoundOperationScopes,
    );
    try {
      const [list, selectedConversations] = await Promise.all([
        reloadConversations(workspaceId),
        window.setta.workspace.selectedConversations(),
      ]);
      const selectedConversationIdsByWorkspaceId = {
        ...get().selectedConversationIdsByWorkspaceId,
        ...selectedConversations.selectedConversationIdsByWorkspaceId,
      };
      const conversation = conversationToLoadForWorkspace(
        { ...get(), selectedConversationIdsByWorkspaceId },
        workspaceId,
        list,
      );
      const patch = conversation
        ? await loadConversationPage(workspaceId, conversation)
        : emptyConversationPatch();
      commitCurrentFromState(operation, (current) => ({
        ...patch,
        ...conversationListLoadedPatch(current, workspaceId, list, true),
        operation: null,
        selectedConversation: patch.selectedConversation ?? conversation,
        selectedConversationIdsByWorkspaceId,
        status: "ready",
        workspaceId,
      }));
    } catch (error) {
      commitCurrent(operation, errorPatch(error));
      throw error;
    }
  }

  return {
    activeRun: null,
    activeRunLiveness: null,
    backgroundTerminalIdsByConversationId: {},
    backgroundTerminalOutputIdsByProcessId: {},
    backgroundTerminalOutputPagesByProcessId: {},
    backgroundTerminalOutputsById: {},
    backgroundTerminalsById: {},
    ...backgroundTerminalActions,
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
    commandListError: null,
    commandListStatus: "idle",
    commandDescriptorCache: {},
    conversationListsByWorkspaceId: {},
    conversationDetailsById: {},
    conversations: [],
    corruption: emptyCorruption,
    diagnostics: [],
    ...attachmentActions,
    editingQueuedMessageId: null,
    goal: null,
    editQueuedMessage: async (messageId: string, input: ChatInput) => {
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
          input,
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
        { error: null, operation: "creating", pendingGoalSubmission: null },
        conversationBoundOperationScopes,
      );
      try {
        const conversation = await window.setta.chat.createConversation(workspaceId, title);
        const patch = await loadConversationPage(workspaceId, conversation);
        const list = await reloadConversations(workspaceId);
        const selectedConversationIdsByWorkspaceId = await persistSelectedConversation(
          workspaceId,
          conversation.id,
        );
        commitCurrentFromState(operation, (current) => ({
          ...patch,
          ...conversationListLoadedPatch(current, workspaceId, list, true),
          operation: null,
          selectedConversation: patch.selectedConversation ?? conversation,
          selectedConversationIdsByWorkspaceId,
          status: "ready",
          workspaceId,
        }));
      } catch (error) {
        commitCurrent(operation, {
          ...errorPatch(error),
          workspaceId: switchingWorkspace ? workspaceId : get().workspaceId,
        });
        throw error;
      }
    },
    deleteConversation: async (conversationId, targetWorkspaceId) => {
      const workspaceId = targetWorkspaceId ?? get().workspaceId;
      if (!workspaceId) {
        return;
      }
      const operation = beginOperation(
        "conversation",
        { error: null, operation: "deleting", pendingGoalSubmission: null },
        conversationBoundOperationScopes,
      );
      try {
        const list = await window.setta.chat.deleteConversation(workspaceId, conversationId);
        const { nextConversationPatch, selectedConversationIdsByWorkspaceId } =
          await deletedConversationSelectionPatch(workspaceId, conversationId, list);
        commitCurrentFromState(operation, (current) => ({
          ...conversationListLoadedPatch(
            current,
            workspaceId,
            list,
            current.workspaceId === workspaceId,
          ),
          ...nextConversationPatch,
          operation: null,
          selectedConversationIdsByWorkspaceId,
          status: "ready",
          workspaceId: current.workspaceId === workspaceId ? workspaceId : current.workspaceId,
        }));
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
        throw error;
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
    handleBackendProcessStatus: (status) => {
      updateBackendLifecycle(status);
    },
    handleEvent: (event) => {
      const state = streamEventBatcher.stateWithCursor(get());
      if (event.type === "chat.resync_required") {
        streamEventBatcher.clear();
        set({
          lastEventSequence: event.payload.currentSequence,
          lastEventStreamId: event.payload.currentStreamId,
        });
        runChatStoreBackgroundResync("event-stream-resync");
        return;
      }
      if (isUnexpectedStream(state, event)) {
        streamEventBatcher.clear();
        set({ lastEventSequence: event.sequence, lastEventStreamId: event.streamId });
        runChatStoreBackgroundResync("event-stream-resync");
        return;
      }
      if (isDuplicateEvent(state, event)) {
        return;
      }
      if (hasSequenceGap(state, event)) {
        streamEventBatcher.clear();
        set({ lastEventSequence: event.sequence, lastEventStreamId: event.streamId });
        runChatStoreBackgroundResync("event-stream-resync");
        return;
      }
      if (isBufferedStreamEvent(event)) {
        streamEventBatcher.queue(event);
        return;
      }
      streamEventBatcher.flush();
      const result = applyChatEvent(get(), event);
      set((current) => ({
        ...normalizeStatePatch(current, result.patch),
        lastEventSequence: event.sequence,
        lastEventStreamId: event.streamId,
      }));
      if (result.resync) {
        runChatStoreBackgroundResync("event-stream-resync");
      }
    },
    invalidateRuntimeState: () => {
      backendGeneration += 1;
      streamEventBatcher.clear();
      resync.clearQueuedResync();
      operations.cancelAll({});
    },
    loadOlder: async () => {
      const { olderBeforeBlockOrdinal, selectedConversation, workspaceId } = get();
      if (
        !workspaceId ||
        !selectedConversation ||
        olderBeforeBlockOrdinal <= 0 ||
        !get().hasMoreOlder
      ) {
        return;
      }
      const operation = beginOperation("pagination", { error: null, operation: "loadingOlder" });
      try {
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          olderBeforeBlockOrdinal,
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
            olderBeforeBlockOrdinal: page.olderBeforeBlockOrdinal,
            operation: null,
            status: "ready",
            transcriptBlocks: prependOlderBlocks(blocksFromPage(page), current.transcriptBlocks),
          };
        });
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
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
    loadWorkspace: loadWorkspaceCommand,
    syncWorkspaceChat: async (workspaceId: string) => {
      try {
        await loadWorkspaceCommand(workspaceId);
      } catch {
        // loadWorkspaceCommand records visible error state for the current request before
        // rejecting. Superseded requests can reject after their operation token is stale.
      }
    },
    lastEventSequence: 0,
    lastEventStreamId: "",
    markConversationRead: async (conversationId: string) => {
      const { conversations, workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      const conversationInWorkspace = conversations.some(
        (item) =>
          item.conversation.id === conversationId && item.conversation.workspaceId === workspaceId,
      );
      if (!conversationInWorkspace) {
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
    olderBeforeBlockOrdinal: 0,
    operation: null,
    pendingGoalSubmission: null,
    queuedRuns: [],
    queueMessage: async (input: ChatInput) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return null;
      }
      const operation = beginOperation("queueMutation", { error: null, operation: "queueing" });
      try {
        const result = await window.setta.chat.queueMessage(
          workspaceId,
          selectedConversation.id,
          input,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, activeRun),
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
          ...pagePatch(result.page, current.activeRun, current.activeRunLiveness),
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
    retryActiveRunLiveness: createRetryActiveRunLivenessAction({
      get,
      runChatStoreBackgroundResync: () => runChatStoreBackgroundResync("event-stream-resync"),
      set,
    }),
    executeCommand: async (
      raw: string,
      options?: ChatCommandExecutionOptions,
      clientOptions?: ChatCommandClientOptions,
    ) => {
      return runCommandMutation(
        (workspaceId, conversationId) =>
          options === undefined
            ? window.setta.chat.executeCommand(workspaceId, conversationId, raw)
            : window.setta.chat.executeCommand(workspaceId, conversationId, raw, options),
        clientOptions,
      );
    },
    openCodexModelPicker: async () => {
      return runCommandMutation((workspaceId, conversationId) =>
        window.setta.chat.openCodexModelPicker(workspaceId, conversationId),
      );
    },
    openCodexPermissionPicker: () =>
      runCommandMutation((workspaceId, conversationId) =>
        window.setta.chat.openCodexPermissionPicker(workspaceId, conversationId),
      ),
    setCodexModel: async (modelId: string) => {
      return runCommandMutation((workspaceId, conversationId) =>
        window.setta.chat.setCodexModel(workspaceId, conversationId, modelId),
      );
    },
    setCodexPermissionPreset: (preset: ChatPermissionPresetID, confirmed: boolean) =>
      runCommandMutation((workspaceId, conversationId) =>
        window.setta.chat.setCodexPermissionPreset(workspaceId, conversationId, preset, confirmed),
      ),
    setCodexReasoningEffort: async (effort: ReasoningEffort) => {
      return runCommandMutation((workspaceId, conversationId) =>
        window.setta.chat.setCodexReasoningEffort(workspaceId, conversationId, effort),
      );
    },
    setConversationPinned: createSetConversationPinnedAction({ get, set }),
    listCommands: async () => {
      const requestID = ++commandListRequestID;
      const state = get();
      const { selectedConversation, workspaceId } = state;
      if (!workspaceId || !selectedConversation) {
        set({ commandListError: null, commandListStatus: "idle" });
        return null;
      }
      const conversationId = selectedConversation.id;
      const cacheKey = commandDescriptorCacheKey(state);
      const cached = state.commandDescriptorCache[cacheKey];
      if (cached) {
        set({ commandListError: null, commandListStatus: "loaded" });
        return { commands: cached };
      }
      set({ commandListError: null, commandListStatus: "loading" });
      try {
        const result = await window.setta.chat.listCommands(workspaceId, conversationId);
        const descriptors = cacheableCommandDescriptors(result.commands);
        set((current) => {
          if (requestID !== commandListRequestID) {
            return {};
          }
          if (!commandListContextMatches(current, workspaceId, conversationId, cacheKey)) {
            return staleCommandListPatch();
          }
          return loadedCommandListPatch(current, cacheKey, descriptors);
        });
        return { commands: descriptors };
      } catch (error) {
        const message = errorMessage(error);
        set((current) => {
          if (requestID !== commandListRequestID) {
            return {};
          }
          if (!commandListContextMatches(current, workspaceId, conversationId, cacheKey)) {
            return staleCommandListPatch();
          }
          return { commandListError: message, commandListStatus: "failed" };
        });
        throw error;
      }
    },
    listComposerPromptHistory: createListComposerPromptHistoryAction(get),
    resyncActiveConversation: resync.resyncActiveConversation,
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
        const { conversation, conversationListPatch } = await resolveConversationSelection(
          request,
          get,
          reloadConversations,
        );
        if (!conversation) {
          commitCurrent(operation, missingConversationPatch(request, conversationListPatch));
          return;
        }
        const patch = await loadConversationPage(request.workspaceId, conversation);
        const selectedConversationIdsByWorkspaceId = await persistSelectedConversation(
          request.workspaceId,
          conversation.id,
        );
        commitCurrent(operation, {
          ...conversationListPatch,
          ...patch,
          operation: null,
          selectedConversation: patch.selectedConversation ?? conversation,
          selectedConversationIdsByWorkspaceId,
          status: "ready",
          workspaceId: request.workspaceId,
        });
      } catch (error) {
        commitCurrent(operation, errorPatch(error));
      }
    },
    selectedConversation: null,
    selectedConversationIdsByWorkspaceId: {},
    sendMessage: async (input: ChatInput) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return null;
      }
      const operation = beginOperation("messageMutation", { error: null, operation: "sending" });
      try {
        const result = await window.setta.chat.sendMessage(
          workspaceId,
          selectedConversation.id,
          input,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
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
    sendSteeringImmediately: async (input?: ChatInput) => {
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
          input,
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
    runsById: {},
    steerMessage: async (input: ChatInput) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return null;
      }
      const operation = beginOperation("messageMutation", { error: null, operation: "steering" });
      try {
        const result = await window.setta.chat.steerMessage(
          workspaceId,
          selectedConversation.id,
          input,
        );
        commitCurrentFromState(operation, (current) => ({
          ...operationPagePatch(current, result.page, result.run, null),
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
    transcriptBlocks: [],
    transcriptBlocksById: {},
    workspaceId: null,
  };
});
