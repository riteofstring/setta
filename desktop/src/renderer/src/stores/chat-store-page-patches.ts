import type { ChatCommandExecuteResult, MessagePage, Run } from "@generated/backend";

import type { ChatPatch, ChatStore } from "./chat-store";
import {
  activeRunAfterOperation,
  activeRunFromCandidate,
  activeRunFromCandidates,
  activeRunFromPage,
  mergeOperationGoal,
  mergeOperationQueue,
  mergeOperationMessages,
  mergeOperationRunItemOutputs,
  mergeOperationRunItems,
  mergeOperationTranscript,
  messagesFromPage,
  normalizeChatPatch,
  queuedRunsFromPage,
  terminalRunIdsAfterOperation,
  terminalRunIdsFromTranscript,
  type RunningRun,
} from "./chat-store-normalization";

export function pagePatch(page: MessagePage, activeRun: Run | null): ChatPatch {
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

export function operationPagePatch(
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

export function runOperationPatch(
  current: ChatStore,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null = null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsAfterOperation(current.transcript, returnedRun);
  return {
    activeRun: activeRunAfterOperation(
      current.activeRun,
      returnedRun,
      fallbackActiveRun,
      terminalRunIds,
    ),
  };
}

export function resyncPagePatch(
  current: ChatStore,
  page: MessagePage,
  activeRun: Run | null,
): ChatPatch {
  const terminalRunIds = terminalRunIdsFromTranscript(current.transcript);
  return terminalPreservingPagePatch(
    current,
    page,
    activeRunFromCandidates(terminalRunIds, activeRun, activeRunFromPage(page)),
    terminalRunIds,
  );
}

export function commandOperationPatch(
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

export function emptyConversationPatch(): ChatPatch {
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

function terminalPreservingPagePatch(
  current: ChatStore,
  page: MessagePage,
  activeRun: RunningRun | null,
  terminalRunIds: Set<string>,
): ChatPatch {
  const activeRunId = activeRun?.id ?? "";
  const patch = pagePatch(
    {
      ...page,
      goal: mergeOperationGoal(current.goal, page.goal),
      runItemOutputs: mergeOperationRunItemOutputs(
        current.runItems,
        current.runItemOutputs,
        page.runItemOutputs,
        terminalRunIds,
        activeRunId,
      ),
      runItems: mergeOperationRunItems(
        current.runItems,
        page.runItems,
        terminalRunIds,
        activeRunId,
      ),
      queue: mergeOperationQueue(page.queue, terminalRunIds),
      transcript: mergeOperationTranscript(current.transcript, page.transcript, terminalRunIds),
    },
    activeRun,
  );
  if (patch.messages) {
    patch.messages = mergeOperationMessages(current.messages, patch.messages, terminalRunIds);
  }
  return patch;
}
