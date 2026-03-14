import { loadAgentRuns } from "state/actions/ai/agentRuns";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
} from "state/actions/ai/chatRuntime";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { type AgentRun } from "utils/generatedTypes";
import { toSortedProjectHistoryEntries } from "./projectChatHistoryUtils";

export type ProjectChatId = string | null | undefined;
export type ProjectChatIdUpdate =
  | ProjectChatId
  | ((currentChatId: ProjectChatId) => ProjectChatId);

type ResumeProjectChatDependencies = {
  loadAgentRuns?: typeof loadAgentRuns;
  getSortedProjectHistoryEntries?: typeof toSortedProjectHistoryEntries;
};

export function startProjectChatThread({
  chatId,
  surfaceId,
  onStartNewChat,
  onDraftThreadStart,
  setChatId,
  initializePendingChat = initializePendingChatDetails,
}: {
  chatId: ProjectChatId;
  surfaceId: string;
  onStartNewChat?: () => void;
  onDraftThreadStart?: () => void;
  setChatId: (nextChatId: ProjectChatIdUpdate) => void;
  initializePendingChat?: typeof initializePendingChatDetails;
}) {
  if (onStartNewChat) {
    onStartNewChat();
    return;
  }
  onDraftThreadStart?.();
  if (chatId === null) {
    return;
  }
  initializePendingChat(surfaceId);
  setChatId(null);
}

export function settleProjectChatThreadStart({
  newChatId,
  succeeded,
  surfaceId,
  onDraftThreadSettled,
  setChatId,
  clearPendingChat = clearPendingChatDetails,
  finalizePendingChat = finalizePendingChatDetails,
}: {
  newChatId: string | null;
  succeeded: boolean;
  surfaceId: string;
  onDraftThreadSettled?: (
    nextChatId: string | null,
    succeeded: boolean,
  ) => void;
  setChatId: (nextChatId: ProjectChatIdUpdate) => void;
  clearPendingChat?: typeof clearPendingChatDetails;
  finalizePendingChat?: typeof finalizePendingChatDetails;
}) {
  onDraftThreadSettled?.(newChatId, succeeded);
  if (!succeeded || !newChatId) {
    clearPendingChat(surfaceId);
    setChatId((currentChatId) => {
      if (currentChatId !== null) {
        return currentChatId;
      }
      return undefined;
    });
    return;
  }
  setChatId(newChatId);
  finalizePendingChat(newChatId, surfaceId);
}

export function selectProjectChatThread({
  nextChatId,
  chatId,
  setChatId,
}: {
  nextChatId: string;
  chatId: ProjectChatId;
  setChatId: (nextChatId: ProjectChatIdUpdate) => void;
}) {
  if (!nextChatId || nextChatId === chatId) {
    return;
  }
  setChatId(nextChatId);
}

export async function resumeLatestProjectChat({
  chatId,
  projectConfigId,
  historyCompatibility,
  agentRuns,
  setChatId,
  dependencies = {},
}: {
  chatId: string | null;
  projectConfigId: string;
  historyCompatibility: ChatHistoryCompatibility | null;
  agentRuns: Array<AgentRun>;
  setChatId: (nextChatId: ProjectChatIdUpdate) => void;
  dependencies?: ResumeProjectChatDependencies;
}) {
  const loadRuns = dependencies.loadAgentRuns ?? loadAgentRuns;
  const getSortedProjectHistoryEntries =
    dependencies.getSortedProjectHistoryEntries ??
    toSortedProjectHistoryEntries;
  await loadRuns();
  const latestEntry = getSortedProjectHistoryEntries(
    agentRuns,
    projectConfigId,
    historyCompatibility,
  ).find((entry) => entry.chatId !== chatId);
  if (!latestEntry) {
    return false;
  }
  setChatId(latestEntry.chatId);
  return true;
}
