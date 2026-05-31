import type {
  ApprovalAnswer,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  ListConversationsResponse,
  MessagePage,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";
import { create } from "zustand";

import { applyChatEvent } from "./chat-events";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type RunningRun = Run & { status: "running" };
type QueuedRun = Run & { status: "queued" };
type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "commanding"
  | "loading"
  | "loadingOlder"
  | "queueing"
  | "refreshing"
  | "sending"
  | "steering"
  | null;

export interface RunItemOutputPageState {
  error: string | null;
  hasMore: boolean;
  loadedThroughOrdinal: number;
  loading: boolean;
  nextOrdinal: number;
}

export interface ChatStore {
  activeRun: RunningRun | null;
  clearQuarantine: () => Promise<void>;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
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
  maintenanceNotice: string | null;
  messageIds: string[];
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage>;
  olderBeforeOrdinal: number;
  operation: ChatOperation;
  queuedRuns: QueuedRun[];
  quarantineCorruptState: () => Promise<void>;
  queueMessage: (prompt: string) => Promise<void>;
  executeCommand: (raw: string) => Promise<ChatCommandExecuteResult>;
  listCommands: () => Promise<ChatCommandListResult | null>;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  resetWorkspaceState: () => Promise<void>;
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
  unreadConversationIds: Record<string, true>;
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
    | "error"
    | "hasMoreOlder"
    | "lastEventSequence"
    | "lastEventStreamId"
    | "maintenanceNotice"
    | "messageIds"
    | "messages"
    | "messagesById"
    | "olderBeforeOrdinal"
    | "operation"
    | "queuedRuns"
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
    | "unreadConversationIds"
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

  async function loadPostMaintenanceConversation(
    workspaceId: string,
    list: ListConversationsResponse,
    selectedConversation: Conversation | null,
  ) {
    const nextConversation = conversationAfterMaintenance(list, selectedConversation);
    if (!nextConversation) {
      return { nextConversation, patch: emptyConversationPatch() };
    }
    return {
      nextConversation,
      patch: await loadConversationPage(workspaceId, nextConversation),
    };
  }

  return {
    activeRun: null,
    clearQuarantine: async () => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({
        error: null,
        maintenanceNotice: null,
        operation: "refreshing",
      });
      try {
        const result = await window.setta.chat.clearQuarantine(workspaceId, workspaceId);
        const list = await reloadConversations(workspaceId);
        commitCurrent(operationId, {
          ...listPatch(list),
          maintenanceNotice: formatMaintenanceNotice(
            "Cleared quarantine",
            result.removedPaths.length,
            result.corruption.total,
          ),
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    conversations: [],
    corruption: emptyCorruption,
    diagnostics: [],
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
        hasMoreOlder: false,
        maintenanceNotice: null,
        messages: [],
        olderBeforeOrdinal: 0,
        operation: "loading",
        runItemOutputPagesByRunItemId: {},
        runItemOutputs: [],
        runItems: [],
        queuedRuns: [],
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
      }
    },
    lastEventSequence: 0,
    lastEventStreamId: "",
    maintenanceNotice: null,
    messageIds: [],
    messages: [],
    messagesById: {},
    olderBeforeOrdinal: 0,
    operation: null,
    queuedRuns: [],
    quarantineCorruptState: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({
        error: null,
        maintenanceNotice: null,
        operation: "refreshing",
      });
      try {
        const result = await window.setta.chat.quarantineCorruptState(workspaceId, workspaceId);
        const list = await reloadConversations(workspaceId);
        const { nextConversation, patch } = await loadPostMaintenanceConversation(
          workspaceId,
          list,
          selectedConversation,
        );
        commitCurrent(operationId, {
          ...patch,
          ...listPatch(list),
          maintenanceNotice: formatMaintenanceNotice(
            "Quarantined records",
            result.quarantined.length,
            result.corruption.total,
          ),
          operation: null,
          selectedConversation: nextConversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
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
    executeCommand: async (raw: string) => {
      const { activeRun, selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        throw new Error("No chat is selected");
      }
      const operationId = beginOperation({ error: null, operation: "commanding" });
      try {
        const result = await window.setta.chat.executeCommand(
          workspaceId,
          selectedConversation.id,
          raw,
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
    resetWorkspaceState: async () => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({
        error: null,
        maintenanceNotice: null,
        operation: "refreshing",
      });
      try {
        const result = await window.setta.chat.resetWorkspaceState(workspaceId, workspaceId);
        const list = await reloadConversations(workspaceId);
        commitCurrent(operationId, {
          ...emptyConversationPatch(),
          ...listPatch(list),
          maintenanceNotice: formatMaintenanceNotice(
            "Reset chat state",
            result.removedPaths.length,
            result.corruption.total,
          ),
          operation: null,
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
    unreadConversationIds: {},
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

function conversationAfterMaintenance(
  list: ListConversationsResponse,
  selectedConversation: Conversation | null,
) {
  if (selectedConversation) {
    const matching = list.conversations.find(
      (item) => item.conversation.id === selectedConversation.id,
    );
    if (matching) {
      return matching.conversation;
    }
  }
  return list.conversations[0]?.conversation ?? null;
}

function formatMaintenanceNotice(action: string, changedCount: number, remainingCount: number) {
  return `${action}: ${changedCount}. Remaining corrupt records: ${remainingCount}.`;
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
  const terminalRunIds = terminalRunIdsAfterOperation(current, returnedRun);
  const activeRun = activeRunAfterOperation(
    current,
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
    activeRunFromCandidates(terminalRunIds, current.activeRun, fallbackActiveRun),
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

function activeRunAfterOperation(
  current: ChatStore,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null,
  terminalRunIds: Set<string>,
): RunningRun | null {
  if (terminalRunIds.has(returnedRun.id)) {
    return activeRunFromCandidates(terminalRunIds, current.activeRun);
  }
  return activeRunFromCandidates(terminalRunIds, returnedRun, current.activeRun, fallbackActiveRun);
}

function terminalRunIdsAfterOperation(current: ChatStore, returnedRun: Run) {
  const runIds = terminalRunIdsFromTranscript(current.transcript);
  if (isTerminalRun(returnedRun)) {
    runIds.add(returnedRun.id);
  }
  return runIds;
}

function terminalRunIdsFromTranscript(transcript: TranscriptTurn[]) {
  const runIds = new Set<string>();
  for (const turn of transcript) {
    if (isTerminalRun(turn.run)) {
      runIds.add(turn.run.id);
    }
  }
  return runIds;
}

function activeRunFromCandidates(
  terminalRunIds: Set<string>,
  ...candidates: Array<Run | null>
): RunningRun | null {
  for (const candidate of candidates) {
    if (candidate && terminalRunIds.has(candidate.id)) {
      continue;
    }
    const activeRun = activeRunFromCandidate(candidate);
    if (activeRun) {
      return activeRun;
    }
  }
  return null;
}

function mergeOperationTranscript(
  currentTranscript: TranscriptTurn[],
  pageTranscript: TranscriptTurn[],
  terminalRunIds: Set<string>,
) {
  const currentByRunId = new Map(currentTranscript.map((turn) => [turn.run.id, turn]));
  return pageTranscript.map((pageTurn) => {
    const current = currentByRunId.get(pageTurn.run.id);
    if (current && terminalRunIds.has(pageTurn.run.id)) {
      return current;
    }
    return pageTurn;
  });
}

function activeRunFromCandidate(run: Run | null): RunningRun | null {
  if (run?.status === "running") {
    return run as RunningRun;
  }
  return null;
}

function queuedRunsFromPage(page: MessagePage): QueuedRun[] {
  return page.queue.runs.filter((run): run is QueuedRun => run.status === "queued");
}

function isTerminalRun(run: Run) {
  return run.status === "completed" || run.status === "cancelled" || run.status === "failed";
}

function mergeOperationMessages(
  currentMessages: ChatMessage[],
  pageMessages: ChatMessage[],
  terminalRunIds: Set<string>,
) {
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  return pageMessages.map((pageMessage) => {
    const current = currentById.get(pageMessage.id);
    if (current && terminalRunIds.has(pageMessage.runId)) {
      return current;
    }
    return pageMessage;
  });
}

function emptyConversationPatch(): ChatPatch {
  return normalizeChatPatch({
    activeRun: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeOrdinal: 0,
    queuedRuns: [],
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

function outputPageLoadedState(
  outputs: RunItemOutput[],
  afterOrdinal: number,
  hasMore: boolean,
  nextOrdinal: number,
): Partial<RunItemOutputPageState> {
  return {
    error: null,
    hasMore,
    loadedThroughOrdinal: outputs.reduce(
      (current, output) => Math.max(current, output.ordinal),
      afterOrdinal,
    ),
    loading: false,
    nextOrdinal,
  };
}

function updateRunItemOutputPageState(
  current: Record<string, RunItemOutputPageState>,
  runItemId: string,
  patch: Partial<RunItemOutputPageState>,
) {
  return {
    ...current,
    [runItemId]: {
      error: null,
      hasMore: false,
      loadedThroughOrdinal: 0,
      loading: false,
      nextOrdinal: 0,
      ...current[runItemId],
      ...patch,
    },
  };
}

function normalizeChatPatch(patch: ChatPatch): ChatPatch {
  const next: ChatPatch = { ...patch };
  let messagesById: Record<string, ChatMessage> | undefined;
  if (patch.messages !== undefined) {
    const normalized = normalizeMessages(patch.messages);
    messagesById = normalized.messagesById;
    Object.assign(next, normalized);
  }
  if (patch.transcript !== undefined) {
    Object.assign(next, normalizeTranscript(patch.transcript, messagesById));
  }
  if (patch.runItems !== undefined) {
    Object.assign(next, normalizeRunItems(patch.runItems));
  }
  if (patch.runItemOutputs !== undefined) {
    Object.assign(next, normalizeRunItemOutputs(patch.runItemOutputs));
  }
  return next;
}

function messagesFromPage(page: MessagePage): ChatMessage[] {
  const messagesById = new Map(page.messages.map((message) => [message.id, message]));
  for (const turn of page.transcript) {
    messagesById.set(turn.triggerMessage.id, turn.triggerMessage);
    if (turn.assistantMessage) {
      messagesById.set(turn.assistantMessage.id, turn.assistantMessage);
    }
    for (const message of turn.steeringMessages) {
      messagesById.set(message.id, message);
    }
  }
  return [...messagesById.values()];
}

function normalizeMessages(messages: ChatMessage[]) {
  const ordered = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const messagesById: Record<string, ChatMessage> = {};
  for (const message of ordered) {
    messagesById[message.id] = message;
  }
  return {
    messageIds: ordered.map((message) => message.id),
    messages: ordered,
    messagesById,
  } satisfies ChatPatch;
}

function normalizeTranscript(
  transcript: TranscriptTurn[],
  messagesById: Record<string, ChatMessage> | undefined,
) {
  return {
    transcript: transcript.map((turn) => hydrateTranscriptTurn(turn, messagesById)),
  } satisfies ChatPatch;
}

function hydrateTranscriptTurn(
  turn: TranscriptTurn,
  messagesById: Record<string, ChatMessage> | undefined,
): TranscriptTurn {
  if (!messagesById) {
    return turn;
  }
  return {
    ...turn,
    assistantMessage: turn.assistantMessage
      ? (messagesById[turn.assistantMessage.id] ?? turn.assistantMessage)
      : null,
    steeringMessages: turn.steeringMessages.map((message) => messagesById[message.id] ?? message),
    triggerMessage: messagesById[turn.triggerMessage.id] ?? turn.triggerMessage,
  };
}

function normalizeRunItems(items: RunItem[]) {
  const ordered = items.toSorted(compareRunItems);
  const runItemsById: Record<string, RunItem> = {};
  const runItemIdsByRunId: Record<string, string[]> = {};
  for (const item of ordered) {
    runItemsById[item.id] = item;
    runItemIdsByRunId[item.runId] = [...(runItemIdsByRunId[item.runId] ?? []), item.id];
  }
  return {
    runItemIdsByRunId,
    runItems: ordered,
    runItemsById,
  } satisfies ChatPatch;
}

function normalizeRunItemOutputs(outputs: RunItemOutput[]) {
  const ordered = outputs.toSorted(compareRunItemOutputs);
  const runItemOutputsById: Record<string, RunItemOutput> = {};
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of ordered) {
    runItemOutputsById[output.id] = output;
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    runItemOutputIdsByRunItemId,
    runItemOutputs: ordered,
    runItemOutputsById,
  } satisfies ChatPatch;
}

export function prependOlderMessages(
  olderMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  const currentIDs = new Set(currentMessages.map((message) => message.id));
  return [...olderMessages.filter((message) => !currentIDs.has(message.id)), ...currentMessages];
}

function prependOlderTranscript(
  olderTranscript: TranscriptTurn[],
  currentTranscript: TranscriptTurn[],
): TranscriptTurn[] {
  const currentRunIds = new Set(currentTranscript.map((turn) => turn.run.id));
  return [
    ...olderTranscript.filter((turn) => !currentRunIds.has(turn.run.id)),
    ...currentTranscript,
  ];
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
