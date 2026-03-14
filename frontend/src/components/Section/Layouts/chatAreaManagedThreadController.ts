import { loadAgentRuns } from "state/actions/ai/agentRuns";
import {
  clearPendingChatDetails,
  initializePendingChatDetails,
} from "state/actions/ai/chatRuntime";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import {
  dispatchOptimisticProjectStateUpdate,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { route_set_chat_section_chat_id } from "utils/generatedEndpoints";
import { type AgentRun } from "utils/generatedTypes";
import { toSortedHistoryEntries } from "./ChatAreaHistoryPanel";

export type ChatSectionChatId = string | null;
export type ChatSectionChatIdUpdate =
  | ChatSectionChatId
  | ((current: ChatSectionChatId) => ChatSectionChatId);

type PersistManagedSectionChatIdDependencies = {
  dispatchProjectStateUpdate?: typeof dispatchOptimisticProjectStateUpdate;
  sendSetChatSectionChatId?: typeof route_set_chat_section_chat_id;
};

type ResumeManagedSectionChatDependencies = {
  loadAgentRuns?: typeof loadAgentRuns;
  getSortedHistoryEntries?: typeof toSortedHistoryEntries;
};

export function persistManagedSectionChatId({
  projectConfigId,
  sectionId,
  chatId,
  dependencies = {},
}: {
  projectConfigId: string;
  sectionId: string;
  chatId: ChatSectionChatId;
  dependencies?: PersistManagedSectionChatIdDependencies;
}) {
  const dispatchProjectStateUpdate =
    dependencies.dispatchProjectStateUpdate ??
    dispatchOptimisticProjectStateUpdate;
  const sendSetChatSectionChatId =
    dependencies.sendSetChatSectionChatId ?? route_set_chat_section_chat_id;
  dispatchProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        chatId,
      });
    },
    send: () =>
      sendSetChatSectionChatId({
        projectConfigId,
        sectionId,
        chatId,
      }),
  });
}

export function setManagedSectionChatId({
  next,
  canUseManagedChat,
  chatId,
  setControlledChatId,
  resolvePersistedChatId,
  persistChatId,
}: {
  next: ChatSectionChatIdUpdate;
  canUseManagedChat: boolean;
  chatId: ChatSectionChatId;
  setControlledChatId?: (next: ChatSectionChatIdUpdate) => void;
  resolvePersistedChatId: () => ChatSectionChatId;
  persistChatId: (chatId: ChatSectionChatId) => void;
}) {
  if (!canUseManagedChat) {
    return;
  }
  if (setControlledChatId) {
    const resolved = typeof next === "function" ? next(chatId) : next;
    if (resolved === chatId) {
      return;
    }
    setControlledChatId(resolved);
    return;
  }
  const currentChatId = resolvePersistedChatId();
  const resolved = typeof next === "function" ? next(currentChatId) : next;
  if (resolved === currentChatId) {
    return;
  }
  persistChatId(resolved);
}

export function startManagedSectionChatThread({
  canUseManagedChat,
  surfaceId,
  setChatId,
  setShowHistory,
  initializePendingChat = initializePendingChatDetails,
}: {
  canUseManagedChat: boolean;
  surfaceId?: string;
  setChatId: (next: ChatSectionChatIdUpdate) => void;
  setShowHistory: (next: boolean) => void;
  initializePendingChat?: typeof initializePendingChatDetails;
}) {
  if (!canUseManagedChat) {
    return;
  }
  if (surfaceId) {
    initializePendingChat(surfaceId);
  }
  setChatId(null);
  setShowHistory(false);
}

export function settleManagedSectionChatThreadStart({
  surfaceId,
  newChatId,
  succeeded,
  setChatId,
  clearPendingChat = clearPendingChatDetails,
}: {
  surfaceId?: string;
  newChatId: string | null;
  succeeded: boolean;
  setChatId: (next: ChatSectionChatIdUpdate) => void;
  clearPendingChat?: typeof clearPendingChatDetails;
}) {
  if (surfaceId) {
    clearPendingChat(surfaceId);
  }
  setChatId((currentChatId) => {
    if (currentChatId !== null) {
      return currentChatId;
    }
    if (!succeeded || !newChatId) {
      return null;
    }
    return newChatId;
  });
}

export function selectManagedSectionChat({
  nextChatId,
  setChatId,
  setShowHistory,
}: {
  nextChatId: string;
  setChatId: (next: ChatSectionChatIdUpdate) => void;
  setShowHistory: (next: boolean) => void;
}) {
  if (!nextChatId) {
    return;
  }
  setChatId(nextChatId);
  setShowHistory(false);
}

export async function resumeLatestManagedSectionChat({
  canUseManagedChat,
  chatId,
  projectConfigId,
  sectionId,
  historyCompatibility,
  agentRuns,
  setChatId,
  setShowHistory,
  dependencies = {},
}: {
  canUseManagedChat: boolean;
  chatId: string | null;
  projectConfigId: string;
  sectionId: string;
  historyCompatibility: ChatHistoryCompatibility | null;
  agentRuns: Array<AgentRun>;
  setChatId: (next: ChatSectionChatIdUpdate) => void;
  setShowHistory: (next: boolean) => void;
  dependencies?: ResumeManagedSectionChatDependencies;
}) {
  if (!canUseManagedChat) {
    return false;
  }
  const loadRuns = dependencies.loadAgentRuns ?? loadAgentRuns;
  const getSortedHistoryEntries =
    dependencies.getSortedHistoryEntries ?? toSortedHistoryEntries;
  await loadRuns();
  const latestEntry = getSortedHistoryEntries(
    agentRuns,
    projectConfigId,
    sectionId,
    historyCompatibility,
  ).find((entry) => entry.chatId !== chatId);
  if (!latestEntry) {
    return false;
  }
  setChatId(latestEntry.chatId);
  setShowHistory(false);
  return true;
}
