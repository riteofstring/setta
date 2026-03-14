import { useEffect, useMemo } from "react";
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import { useAIStore } from "state/definitions";
import { AgentRun, EngineTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

const MANAGED_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS = 5000;
const MANAGED_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS = 10000;

type ChatSectionHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

export function resolveManagedChatHistoryPollIntervalMs({
  hasLoadError,
  hasRunningHistoryEntry,
}: {
  hasLoadError: boolean;
  hasRunningHistoryEntry: boolean;
}): number | null {
  if (hasRunningHistoryEntry) {
    return MANAGED_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS;
  }
  if (hasLoadError) {
    return MANAGED_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS;
  }
  return null;
}

function formatHistoryTimestamp(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "No timestamp";
  }
  return new Date(timestampMs).toLocaleString();
}

function getHistoryPlaceholderText(
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

function ChatSectionHistoryList({
  entries,
  activeChatId,
  initialLoadComplete,
  loadError,
  onSelect,
}: {
  entries: Array<ChatSectionHistoryEntry>;
  activeChatId: string | null;
  initialLoadComplete: boolean;
  loadError: string | null;
  onSelect: (chatId: string) => void;
}) {
  const placeholderText = useMemo(
    () =>
      getHistoryPlaceholderText(initialLoadComplete, loadError, entries.length),
    [entries.length, initialLoadComplete, loadError],
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-center text-xs text-setta-400">{placeholderText}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <button
            key={entry.chatId}
            type="button"
            className={`group/historyitem flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-setta-800 ${
              entry.chatId === activeChatId
                ? "bg-blue-600 dark:bg-blue-700"
                : ""
            }`}
            onClick={() => onSelect(entry.chatId)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                className={`truncate text-xs font-semibold text-setta-600 dark:text-setta-100 ${
                  entry.chatId === activeChatId
                    ? "text-white dark:text-white"
                    : ""
                }`}
              >
                {entry.label}
              </p>
              <p
                className={`truncate text-[11px] text-setta-500 dark:text-setta-300 ${
                  entry.chatId === activeChatId
                    ? "text-white/90 dark:text-white/90"
                    : ""
                }`}
              >
                {formatHistoryTimestamp(entry.lastUpdatedMs)}
              </p>
            </div>
            {entry.waitingForResponse ? (
              <i
                className={`gg-spinner single-cell-child !scale-75 ${
                  entry.chatId === activeChatId
                    ? "text-white dark:text-white"
                    : "text-setta-500/70"
                }`}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ManagedChatHistoryPanel({
  projectConfigId,
  sectionId,
  activeChatId,
  historyCompatibility,
  onSelect,
}: {
  projectConfigId: string;
  sectionId: string;
  activeChatId: string | null;
  historyCompatibility: ChatHistoryCompatibility | null;
  onSelect: (chatId: string) => void;
}) {
  const { agentRuns, agentRunsInitialLoadComplete, agentRunsLoadError } =
    useAIStore(
      (state) => ({
        agentRuns: state.agentRuns,
        agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
        agentRunsLoadError: state.agentRunsLoadError,
      }),
      shallow,
    );
  const sectionHistoryEntries = useMemo(
    () =>
      toSortedHistoryEntries(
        agentRuns,
        projectConfigId,
        sectionId,
        historyCompatibility,
      ),
    [agentRuns, historyCompatibility, projectConfigId, sectionId],
  );
  const hasRunningHistoryEntry = useMemo(
    () => sectionHistoryEntries.some((entry) => entry.waitingForResponse),
    [sectionHistoryEntries],
  );
  const pollIntervalMs = resolveManagedChatHistoryPollIntervalMs({
    hasLoadError: Boolean(agentRunsLoadError),
    hasRunningHistoryEntry,
  });

  useEffect(() => {
    let intervalId: number | null = null;

    const clearPollingInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const startPollingIfNeeded = () => {
      clearPollingInterval();
      if (pollIntervalMs === null || document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        void loadAgentRuns();
      }, pollIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearPollingInterval();
        return;
      }
      void loadAgentRuns();
      startPollingIfNeeded();
    };

    void loadAgentRuns();
    startPollingIfNeeded();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollIntervalMs]);

  return (
    <ChatSectionHistoryList
      entries={sectionHistoryEntries}
      activeChatId={activeChatId}
      initialLoadComplete={agentRunsInitialLoadComplete}
      loadError={agentRunsLoadError}
      onSelect={onSelect}
    />
  );
}
