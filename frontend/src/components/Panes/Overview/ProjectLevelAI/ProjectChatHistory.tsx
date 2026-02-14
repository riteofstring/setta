import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react";
import { loadAgentRuns } from "state/actions/ai";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import { useAIStore } from "state/definitions";
import { shallow } from "zustand/shallow";

export function ProjectChatHistory({
  chatId,
  setChatId,
}: {
  chatId: string | null | undefined;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
}) {
  const { agentRuns, agentRunsInitialLoadComplete, agentRunsLoadError } =
    useAIStore(
      (x) => ({
        agentRuns: x.agentRuns,
        agentRunsInitialLoadComplete: x.agentRunsInitialLoadComplete,
        agentRunsLoadError: x.agentRunsLoadError,
      }),
      shallow,
    );

  useEffect(() => {
    void loadAgentRuns();
  }, []);

  const historyEntries = useMemo(() => {
    return buildChatHistoryEntries(agentRuns, { unscopedOnly: true });
  }, [agentRuns]);

  const sortedEntries = useMemo(() => {
    return [...historyEntries].sort(
      (a, b) => b.lastUpdatedMs - a.lastUpdatedMs,
    );
  }, [historyEntries]);

  const placeholderText = useMemo(() => {
    return getPlaceholderText(
      agentRunsInitialLoadComplete,
      agentRunsLoadError,
      sortedEntries.length,
    );
  }, [agentRunsInitialLoadComplete, agentRunsLoadError, sortedEntries.length]);

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      {sortedEntries.length === 0 ? (
        <p className="text-center text-xs text-setta-400">{placeholderText}</p>
      ) : (
        sortedEntries.map((entry) => (
          <div
            key={entry.chatId}
            className={`group/historyitem flex cursor-pointer flex-row justify-between gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-white hover:shadow-sm focus-visible:border-blue-500 hover:dark:bg-setta-800 ${
              entry.chatId === chatId ? "bg-blue-600 dark:bg-blue-700" : ""
            }`}
            onClick={() => {
              setChatId(entry.chatId);
              useAIStore.setState({ viewHistory: false });
            }}
          >
            <div className="flex w-full flex-col gap-1">
              <header className="flex items-center justify-between gap-2">
                <h4
                  className={`min-w-0 flex-1 truncate font-semibold text-setta-500 dark:text-setta-100 ${
                    entry.chatId === chatId
                      ? "text-white group-hover/historyitem:text-setta-500 dark:text-white dark:group-hover/historyitem:text-white"
                      : ""
                  }`}
                >
                  {entry.label}
                </h4>
                <div className="flex items-center gap-2">
                  {entry.nameSource ? (
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        entry.chatId === chatId
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-setta-200 bg-white/80 text-setta-600 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-200"
                      }`}
                      title={`Title source: ${formatTitleSource(entry.nameSource)}`}
                    >
                      {formatTitleSource(entry.nameSource)}
                    </span>
                  ) : null}
                  {entry.waitingForResponse ? (
                    <i
                      className={`gg-spinner single-cell-child !scale-75 self-center justify-self-end text-setta-500/70 ${
                        entry.chatId === chatId
                          ? "text-white group-hover/historyitem:text-setta-800 dark:text-setta-100 dark:group-hover/historyitem:text-setta-100"
                          : ""
                      }`}
                    />
                  ) : null}
                </div>
              </header>

              <p
                className={`truncate text-xs text-setta-800 dark:text-setta-200 ${
                  entry.chatId === chatId
                    ? "text-white group-hover/historyitem:text-setta-800 dark:text-setta-100 dark:group-hover/historyitem:text-setta-100"
                    : ""
                }`}
              >
                {formatChatTimestamp(entry.lastUpdatedMs)}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function getPlaceholderText(
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

function formatChatTimestamp(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "No timestamp";
  }
  return new Date(timestampMs).toLocaleString();
}

function formatTitleSource(
  source: "llm" | "deterministic" | "reused" | "external",
): string {
  if (source === "llm") {
    return "LLM";
  }
  if (source === "external") {
    return "External";
  }
  if (source === "reused") {
    return "Reused";
  }
  return "Deterministic";
}
