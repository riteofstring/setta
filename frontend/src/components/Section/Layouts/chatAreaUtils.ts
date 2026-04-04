import _ from "lodash";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import {
  AgentRun,
  ChatSectionState,
  EngineTypeEnum,
} from "utils/generatedTypes";

export function shouldPersistInitializedChatState({
  currentState,
  initializedState,
}: {
  currentState: ChatSectionState;
  initializedState: ChatSectionState;
}): boolean {
  const currentBranches = currentState.branches ?? {};
  if (Object.keys(currentBranches).length > 0) {
    return false;
  }
  const currentActiveBranchId =
    typeof currentState.activeBranchId === "string" &&
    currentState.activeBranchId.trim() !== ""
      ? currentState.activeBranchId.trim()
      : null;
  if (currentActiveBranchId !== null) {
    return false;
  }
  return _.isEqual(
    {
      messages: currentState.messages ?? [],
      inputText: currentState.inputText ?? "",
      waitingForResponse: currentState.waitingForResponse,
      toolCallArguments: currentState.toolCallArguments ?? {},
    },
    {
      messages: initializedState.messages ?? [],
      inputText: initializedState.inputText ?? "",
      waitingForResponse: initializedState.waitingForResponse,
      toolCallArguments: initializedState.toolCallArguments ?? {},
    },
  );
}

export function shouldExitManagedChatHistory({
  previousChatId,
  nextChatId,
  previousWaitingForResponse,
  nextWaitingForResponse,
}: {
  previousChatId: string | null | undefined;
  nextChatId: string | null;
  previousWaitingForResponse: boolean;
  nextWaitingForResponse: boolean;
}): boolean {
  if (previousChatId !== undefined && previousChatId !== nextChatId) {
    return true;
  }
  return !previousWaitingForResponse && nextWaitingForResponse;
}

export function getManagedChatRunRefreshKey({
  agentRuns,
  sectionId,
  chatId,
  runType,
}: {
  agentRuns: Array<AgentRun>;
  sectionId: string;
  chatId: string | null;
  runType: ChatRunType | null;
}): string | null {
  if (!chatId || !runType) {
    return null;
  }
  let latestMatchingRun: AgentRun | null = null;
  let latestUpdatedMs = -1;
  for (const run of agentRuns) {
    if (getRunInputString(run, "runType") !== runType) {
      continue;
    }
    if (getRunInputString(run, "sectionId") !== sectionId) {
      continue;
    }
    if (getRunInputString(run, "chatId") !== chatId) {
      continue;
    }
    const updatedMs = getRunLastUpdatedMs(run);
    if (updatedMs <= latestUpdatedMs) {
      continue;
    }
    latestMatchingRun = run;
    latestUpdatedMs = updatedMs;
  }
  if (!latestMatchingRun) {
    return null;
  }
  return `${latestMatchingRun.id}:${latestMatchingRun.status}:${latestUpdatedMs}`;
}

export function buildManagedZeroScopeBannerSessionKey(
  projectConfigId: string,
  sectionId: string,
): string {
  return `setta:managed-zero-scope-banner-dismissed:${projectConfigId}:${sectionId}`;
}

export function formatHistoryTimestamp(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "No timestamp";
  }
  return new Date(timestampMs).toLocaleString();
}

export function getHistoryPlaceholderText(
  initialLoadComplete: boolean,
  loadError: string | null,
  entryCount: number,
): string {
  if (loadError) {
    return loadError;
  }
  if (!initialLoadComplete) {
    return "Loading chat history...";
  }
  if (entryCount === 0) {
    return "No chat history yet";
  }
  return "";
}

export type ChatSectionHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

export function toSortedHistoryEntries(
  runs: Array<AgentRun>,
  projectConfigId: string,
  sectionId: string,
  compatibility: ChatHistoryCompatibility | null,
): Array<ChatSectionHistoryEntry> {
  return buildChatHistoryEntries(runs, {
    projectConfigId,
    sectionId,
    compatibility,
  }).sort((left, right) => right.lastUpdatedMs - left.lastUpdatedMs);
}

export function resolveManagedChatRunType(
  engineType: EngineTypeEnum | null,
): ChatRunType | null {
  if (engineType === EngineTypeEnum.external_agent) {
    return "external_agent";
  }
  if (engineType === EngineTypeEnum.setta_llm) {
    return "llm_chat";
  }
  return null;
}
