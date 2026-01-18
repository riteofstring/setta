import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { buildChatStateFromAgentRun, loadAgentRuns } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { AgentRun } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

export function ProjectChatHistory({
  setChatId,
}: {
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { agentRuns, agentRunsInitialLoadComplete } = useAIStore(
    (x) => ({
      agentRuns: x.agentRuns,
      agentRunsInitialLoadComplete: x.agentRunsInitialLoadComplete,
    }),
    shallow,
  );

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  const sortedRuns = useMemo(() => {
    return [...agentRuns].sort((a, b) => {
      return getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a);
    });
  }, [agentRuns]);

  useEffect(() => {
    if (selectedRunId || sortedRuns.length === 0) {
      return;
    }
    setSelectedRunId(sortedRuns[0].id);
  }, [selectedRunId, sortedRuns]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) {
      return null;
    }
    return sortedRuns.find((run) => run.id === selectedRunId) ?? null;
  }, [selectedRunId, sortedRuns]);

  const selectedChatState = useMemo(() => {
    if (!selectedRun) {
      return null;
    }
    return buildChatStateFromAgentRun(selectedRun);
  }, [selectedRun]);

  const placeholder = getPlaceholderText(
    agentRunsInitialLoadComplete,
    sortedRuns.length,
  );

  const runDetails = selectedRun ? buildRunDetails(selectedRun) : null;

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      <div className="flex w-72 flex-col gap-2 overflow-y-auto">
        {sortedRuns.length === 0 ? (
          <p className="text-center text-xs text-setta-400">{placeholder}</p>
        ) : (
          sortedRuns.map((run) => {
            const isActive = run.id === selectedRunId;
            return (
              <button
                key={run.id}
                className={`group/historyitem flex cursor-pointer flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-white hover:shadow-sm focus-visible:border-blue-500 hover:dark:bg-setta-800 ${
                  isActive ? "bg-blue-600 dark:bg-blue-700" : ""
                }`}
                onClick={() => {
                  setSelectedRunId(run.id);
                  const nextChatId = getRunChatId(run);
                  if (nextChatId) {
                    setChatId(nextChatId);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <h4
                    className={`truncate text-xs font-semibold text-setta-500 dark:text-setta-100 ${
                      isActive
                        ? "text-white group-hover/historyitem:text-setta-500 dark:text-white dark:group-hover/historyitem:text-white"
                        : ""
                    }`}
                  >
                    {getRunLabel(run)}
                  </h4>
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] uppercase tracking-wide ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-setta-100 text-setta-500 dark:bg-setta-700/70 dark:text-setta-200"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <p
                  className={`truncate text-[11px] text-setta-700 dark:text-setta-200 ${
                    isActive
                      ? "text-white group-hover/historyitem:text-setta-700 dark:text-setta-100 dark:group-hover/historyitem:text-setta-100"
                      : ""
                  }`}
                >
                  {formatRunTimestamp(run)}
                </p>
              </button>
            );
          })
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {runDetails ? (
          <div className="rounded border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 shadow-sm dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200">
            <div className="flex flex-wrap gap-3">
              {runDetails.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
                    {entry.label}
                  </span>
                  <span>{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded border border-setta-100 bg-white/70 p-2 dark:border-setta-800 dark:bg-setta-950/30">
          {selectedChatState ? (
            <ChatMessageList
              messages={selectedChatState.messages}
              waitingForResponse={selectedChatState.waitingForResponse}
              toolCallArguments={selectedChatState.toolCallArguments}
            />
          ) : (
            <p className="m-auto text-center text-xs text-setta-400">
              {placeholder}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getPlaceholderText(
  initialLoadComplete: boolean,
  runCount: number,
): string {
  if (!initialLoadComplete) {
    return "Loading runs...";
  }
  if (runCount === 0) {
    return "No runs yet";
  }
  return "Select a run";
}

function getRunChatId(run: AgentRun): string | null {
  const chatId = run.inputs?.chatId;
  if (typeof chatId === "string" && chatId.trim()) {
    return chatId;
  }
  return null;
}

function getRunLabel(run: AgentRun): string {
  const runType = run.inputs?.runType;
  if (typeof runType === "string" && runType.trim()) {
    return runType.replaceAll("_", " ");
  }
  return "run";
}

function formatRunTimestamp(run: AgentRun): string {
  const timestamp = getRunLastUpdatedMs(run);
  if (!timestamp) {
    return "No timestamp";
  }
  return new Date(timestamp).toLocaleString();
}

function getRunLastUpdatedMs(run: AgentRun): number {
  const eventTimestamps = run.events
    .map((event) => Date.parse(event.timestamp))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : NaN;
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}

function buildRunDetails(
  run: AgentRun,
): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [
    { label: "Run", value: run.id },
    { label: "Status", value: run.status },
  ];
  if (run.inputs) {
    const engine = run.inputs.externalAgentConfigId ?? run.inputs.llmConfigId;
    if (typeof engine === "string" && engine.trim()) {
      items.push({ label: "Engine", value: engine });
    }
  }
  if (run.startedAt) {
    items.push({
      label: "Started",
      value: new Date(run.startedAt).toLocaleString(),
    });
  }
  if (run.finishedAt) {
    items.push({
      label: "Finished",
      value: new Date(run.finishedAt).toLocaleString(),
    });
  }
  return items;
}
