import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react";
import { loadAgentRuns } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import {
  AgentRun,
  AgentRunStatusEnum,
  BaseChatMessageUnion,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type ChatHistoryEntry = {
  chatId: string;
  label: string;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

type ChatRunSummary = {
  latestRun: AgentRun;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

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
    return buildChatHistoryEntries(agentRuns);
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
              <header className="flex gap-1">
                <h4
                  className={`truncate font-semibold text-setta-500 dark:text-setta-100 ${
                    entry.chatId === chatId
                      ? "text-white group-hover/historyitem:text-setta-500 dark:text-white dark:group-hover/historyitem:text-white"
                      : ""
                  }`}
                >
                  {entry.label}
                </h4>
                {entry.waitingForResponse ? (
                  <i
                    className={`gg-spinner single-cell-child !scale-75 self-center justify-self-end text-setta-500/70 ${
                      entry.chatId === chatId
                        ? "text-white group-hover/historyitem:text-setta-800 dark:text-setta-100 dark:group-hover/historyitem:text-setta-100"
                        : ""
                    }`}
                  />
                ) : null}
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

function buildChatHistoryEntries(
  runs: Array<AgentRun>,
): Array<ChatHistoryEntry> {
  const grouped = new Map<string, ChatRunSummary>();
  for (const run of runs) {
    if (!isChatRun(run)) {
      continue;
    }
    if (isBranchRun(run)) {
      continue;
    }
    const runChatId = getRunChatId(run);
    if (!runChatId) {
      continue;
    }
    const lastUpdatedMs = getRunLastUpdatedMs(run);
    const waitingForResponse = run.status === AgentRunStatusEnum.running;
    const existing = grouped.get(runChatId);
    if (!existing) {
      grouped.set(runChatId, {
        latestRun: run,
        lastUpdatedMs,
        waitingForResponse,
      });
      continue;
    }
    const nextWaiting = existing.waitingForResponse || waitingForResponse;
    if (lastUpdatedMs > existing.lastUpdatedMs) {
      grouped.set(runChatId, {
        latestRun: run,
        lastUpdatedMs,
        waitingForResponse: nextWaiting,
      });
      continue;
    }
    if (nextWaiting !== existing.waitingForResponse) {
      grouped.set(runChatId, {
        ...existing,
        waitingForResponse: nextWaiting,
      });
    }
  }

  const entries: Array<ChatHistoryEntry> = [];
  for (const [runChatId, summary] of grouped.entries()) {
    entries.push({
      chatId: runChatId,
      label: deriveChatLabel(summary.latestRun, runChatId),
      lastUpdatedMs: summary.lastUpdatedMs,
      waitingForResponse: summary.waitingForResponse,
    });
  }
  return entries;
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

function getRunChatId(run: AgentRun): string | null {
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const chatId = inputs ? inputs.chatId : null;
  if (typeof chatId === "string" && chatId.trim()) {
    return chatId;
  }
  return null;
}

function getRunType(run: AgentRun): string | null {
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const runType = inputs ? inputs.runType : null;
  if (typeof runType === "string" && runType.trim()) {
    return runType;
  }
  return null;
}

function isChatRun(run: AgentRun): boolean {
  const runType = getRunType(run);
  if (!runType) {
    return false;
  }
  return (
    runType === "llm_chat" ||
    runType === "external_agent" ||
    runType === "scriptable_chat"
  );
}

function isBranchRun(run: AgentRun): boolean {
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const branchParentChatId = inputs ? inputs.branchParentChatId : null;
  if (typeof branchParentChatId === "string" && branchParentChatId.trim()) {
    return true;
  }
  return false;
}

function getRunLastUpdatedMs(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}

function deriveChatLabel(run: AgentRun, chatId: string): string {
  const outputName = getRunOutputString(run, "name");
  if (outputName) {
    return outputName;
  }
  const messages = getRunMessages(run);
  const firstText = extractFirstMessageText(messages);
  if (firstText) {
    return firstText.slice(0, 30);
  }
  return `Chat ${chatId.slice(0, 8)}`;
}

function getRunOutputString(run: AgentRun, key: string): string | null {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const value = outputs ? outputs[key] : null;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function getRunMessages(run: AgentRun): Array<BaseChatMessageUnion> {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const outputMessages = outputs ? outputs.messages : null;
  if (Array.isArray(outputMessages)) {
    return outputMessages as Array<BaseChatMessageUnion>;
  }
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const inputMessages = inputs ? inputs.messages : null;
  if (Array.isArray(inputMessages)) {
    return inputMessages as Array<BaseChatMessageUnion>;
  }
  return [];
}

function extractFirstMessageText(
  messages: Array<BaseChatMessageUnion>,
): string | null {
  for (const message of messages) {
    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!isRecord(block)) {
        continue;
      }
      const type = block.type;
      if (type !== "text") {
        continue;
      }
      const text = block.text;
      if (typeof text === "string" && text.trim()) {
        return text.trim();
      }
    }
  }
  return null;
}

function formatChatTimestamp(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "No timestamp";
  }
  return new Date(timestampMs).toLocaleString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
