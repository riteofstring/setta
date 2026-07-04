import type { ChatCommandExecuteResult, MessagePage, Run, RunLiveness } from "@generated/backend";

import type { ChatPatch, ChatStore } from "./chat-store";
import {
  activeRunAfterOperation,
  activeRunFromCandidate,
  activeRunFromCandidates,
  activeRunLivenessFromCandidates,
  blocksFromPage,
  mergeOperationBlocks,
  mergeOperationGoal,
  mergeOperationQueue,
  mergeOperationMessages,
  messagesFromPage,
  normalizeChatPatch,
  queuedRunsFromPage,
  runsByIdFromRuns,
  terminalRunIdsAfterOperation,
  terminalRunIdsFromBlocks,
  type RunningRun,
  upsertRunsById,
} from "./chat-store-normalization";

// A page is a fresh conversation transcript snapshot. Raw run items and run item
// outputs are no longer carried on the page (the transcript renders from blocks);
// they are detail-surface data loaded lazily by source run item ID, so a fresh
// page resets them and an operation patch restores the current ones below.
export function pagePatch(
  page: MessagePage,
  activeRun: Run | null,
  activeRunLiveness: RunLiveness | null,
): ChatPatch {
  const normalizedActiveRun = activeRunFromCandidate(activeRun);
  return normalizeChatPatch({
    activeRun: normalizedActiveRun,
    activeRunLiveness: activeRunLivenessFromCandidates(normalizedActiveRun, activeRunLiveness),
    goal: page.goal,
    hasMoreOlder: page.hasMoreOlder,
    messages: messagesFromPage(page),
    olderBeforeBlockOrdinal: page.olderBeforeBlockOrdinal,
    queuedRuns: queuedRunsFromPage(page),
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runsById: runsByIdFromRuns([activeRun, ...page.queue.runs]),
    selectedConversation: page.conversation,
    transcriptBlocks: blocksFromPage(page),
  });
}

export function operationPagePatch(
  current: ChatStore,
  page: MessagePage,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsAfterOperation(
    current.transcriptBlocks,
    current.activeRun?.id ?? null,
    returnedRun,
  );
  const activeRun = activeRunAfterOperation(
    current.activeRun,
    returnedRun,
    fallbackActiveRun,
    terminalRunIds,
  );
  return terminalPreservingPagePatch({
    current,
    page,
    activeRun,
    activeRunLiveness: activeRunLivenessFromCandidates(activeRun, current.activeRunLiveness),
    terminalRunIds,
    observedRuns: [returnedRun, activeRun, ...page.queue.runs],
  });
}

export function runOperationPatch(
  current: ChatStore,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null = null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsAfterOperation(
    current.transcriptBlocks,
    current.activeRun?.id ?? null,
    returnedRun,
  );
  return {
    activeRun: activeRunAfterOperation(
      current.activeRun,
      returnedRun,
      fallbackActiveRun,
      terminalRunIds,
    ),
    activeRunLiveness: activeRunLivenessFromCandidates(
      activeRunAfterOperation(current.activeRun, returnedRun, fallbackActiveRun, terminalRunIds),
      current.activeRunLiveness,
    ),
    runsById: upsertRunsById(current.runsById, [returnedRun]),
  };
}

export function resyncPagePatch(
  current: ChatStore,
  page: MessagePage,
  activeRun: Run | null,
  activeRunLiveness: RunLiveness | null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsFromBlocks(
    current.transcriptBlocks,
    current.activeRun?.id ?? null,
  );
  const normalizedActiveRun = activeRunFromCandidates(terminalRunIds, activeRun);
  return terminalPreservingPagePatch({
    current,
    page,
    activeRun: normalizedActiveRun,
    activeRunLiveness: activeRunLivenessFromCandidates(normalizedActiveRun, activeRunLiveness),
    terminalRunIds,
    observedRuns: [activeRun, ...page.queue.runs],
  });
}

export function commandOperationPatch(
  current: ChatStore,
  result: ChatCommandExecuteResult,
  fallbackActiveRun: RunningRun | null,
): ChatPatch {
  const activeRunId =
    result.activeRun?.status === "running" ? result.activeRun.id : (current.activeRun?.id ?? null);
  const terminalRunIds = terminalRunIdsFromBlocks(current.transcriptBlocks, activeRunId);
  const activeRun = activeRunFromCandidates(
    terminalRunIds,
    result.activeRun,
    current.activeRun,
    fallbackActiveRun,
  );
  return terminalPreservingPagePatch({
    current,
    page: result.page,
    activeRun,
    activeRunLiveness: activeRunLivenessFromCandidates(
      activeRun,
      result.activeRunLiveness,
      current.activeRunLiveness,
    ),
    terminalRunIds,
    observedRuns: [
      result.activeRun,
      current.activeRun,
      fallbackActiveRun,
      ...result.page.queue.runs,
    ],
  });
}

export function emptyConversationPatch(): ChatPatch {
  return normalizeChatPatch({
    activeRun: null,
    activeRunLiveness: null,
    backgroundTerminalIdsByConversationId: {},
    backgroundTerminalOutputIdsByProcessId: {},
    backgroundTerminalOutputPagesByProcessId: {},
    backgroundTerminalOutputsById: {},
    backgroundTerminalsById: {},
    editingQueuedMessageId: null,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeBlockOrdinal: 0,
    pendingGoalSubmission: null,
    queuedRuns: [],
    removingQueuedMessageId: null,
    runItemOutputPagesByRunItemId: {},
    runItemOutputs: [],
    runsById: {},
    selectedConversation: null,
    transcriptBlocks: [],
  });
}

interface TerminalPreservingPagePatchOptions {
  activeRun: RunningRun | null;
  activeRunLiveness: RunLiveness | null;
  current: ChatStore;
  observedRuns: Iterable<Run | null | undefined>;
  page: MessagePage;
  terminalRunIds: Set<string>;
}

function terminalPreservingPagePatch({
  activeRun,
  activeRunLiveness,
  current,
  observedRuns,
  page,
  terminalRunIds,
}: TerminalPreservingPagePatchOptions): ChatPatch {
  const patch = pagePatch(
    {
      ...page,
      goal: mergeOperationGoal(current.goal, page.goal),
      queue: mergeOperationQueue(page.queue, terminalRunIds),
      blocks: mergeOperationBlocks(current.transcriptBlocks, page.blocks, terminalRunIds),
    },
    activeRun,
    activeRunLiveness,
  );
  if (patch.messages) {
    patch.messages = mergeOperationMessages(current.messages, patch.messages, terminalRunIds);
  }
  // The page carries no detail-surface data, so an operation keeps the run-item
  // outputs already loaded for this conversation instead of clearing them.
  return {
    ...patch,
    runItemOutputIdsByRunItemId: current.runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId: current.runItemOutputPagesByRunItemId,
    runItemOutputs: current.runItemOutputs,
    runItemOutputsById: current.runItemOutputsById,
    runsById: upsertRunsById(current.runsById, observedRuns),
  };
}
