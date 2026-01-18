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
import {
  AgentRun,
  RunEvent,
  StreamingEventTypeEnum,
  ToolCallDeltaEvent,
  ToolChatMessage,
  ToolResultEvent,
} from "utils/generatedTypes";
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
  const runTrace = selectedRun ? buildRunTraceEntries(selectedRun) : [];

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

        <div className="flex flex-col gap-2 rounded border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 shadow-sm dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
              Run Trace
            </span>
            <span className="text-[10px] text-setta-400">
              {runTrace.length} events
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto pr-2">
            {runTrace.length === 0 ? (
              <p className="py-2 text-center text-xs text-setta-400">
                No trace events yet.
              </p>
            ) : (
              runTrace.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-3 border-b border-setta-100 py-2 last:border-b-0 dark:border-setta-800"
                >
                  <div className="w-28 shrink-0 text-[10px] text-setta-400">
                    {entry.timestamp}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-semibold text-setta-700 dark:text-setta-100">
                      {entry.type}
                    </span>
                    {entry.detail ? (
                      <span className="break-words text-[11px] text-setta-500 dark:text-setta-300">
                        {entry.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
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
  const metadata = extractRunMetadata(run);
  const engine =
    metadata.engineConfigId ?? extractRunInputString(run, "engineConfigId");
  if (engine) {
    items.push({ label: "Engine", value: engine });
  }
  if (metadata.model) {
    items.push({ label: "Model", value: metadata.model });
  }
  if (
    metadata.toolType === "claude_code" &&
    metadata.approvalPolicy === "plan"
  ) {
    items.push({ label: "Mode", value: "Plan" });
  }
  const usageText = formatUsageSummary(extractRunUsage(run));
  if (usageText) {
    items.push({ label: "Tokens", value: usageText });
  }
  const cost = extractRunCost(run);
  if (cost !== null) {
    items.push({ label: "Cost", value: formatCost(cost) });
  }
  const duration = formatRunDuration(run);
  if (duration) {
    items.push({ label: "Duration", value: duration });
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

type RunMetadata = {
  engineConfigId: string | null;
  model: string | null;
  provider: string | null;
  toolType: string | null;
  runMode: string | null;
  externalAgentConfigId: string | null;
  llmConfigId: string | null;
  approvalPolicy: string | null;
};

type RunUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type RunTraceEntry = {
  id: string;
  timestamp: string;
  type: string;
  detail: string | null;
};

function extractRunMetadata(run: AgentRun): RunMetadata {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const metadata =
    outputs && isRecord(outputs.metadata) ? outputs.metadata : null;
  const engineConfigId =
    getString(metadata?.engineConfigId) ?? getString(outputs?.engineConfigId);
  const model = getString(metadata?.model) ?? getString(outputs?.model);
  const provider =
    getString(metadata?.provider) ?? getString(outputs?.provider);
  const toolType =
    getString(metadata?.toolType) ?? getString(outputs?.toolType);
  const runMode = getString(metadata?.runMode) ?? getString(outputs?.runMode);
  const externalAgentConfigId =
    getString(metadata?.externalAgentConfigId) ??
    getString(outputs?.externalAgentConfigId);
  const llmConfigId =
    getString(metadata?.llmConfigId) ?? getString(outputs?.llmConfigId);
  const approvalPolicy =
    getString(metadata?.approvalPolicy) ?? getString(outputs?.approvalPolicy);
  return {
    engineConfigId,
    model,
    provider,
    toolType,
    runMode,
    externalAgentConfigId,
    llmConfigId,
    approvalPolicy,
  };
}

function extractRunInputString(run: AgentRun, key: string): string | null {
  if (!isRecord(run.inputs)) {
    return null;
  }
  return getString(run.inputs[key]);
}

function extractRunUsage(run: AgentRun): RunUsage | null {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const usage = outputs && isRecord(outputs.usage) ? outputs.usage : null;
  if (!usage) {
    return null;
  }
  const promptTokens = getNumber(usage.promptTokens);
  const completionTokens = getNumber(usage.completionTokens);
  const totalTokens = getNumber(usage.totalTokens);
  const inputTokens = getNumber(usage.inputTokens);
  const outputTokens = getNumber(usage.outputTokens);
  if (
    promptTokens === null &&
    completionTokens === null &&
    totalTokens === null &&
    inputTokens === null &&
    outputTokens === null
  ) {
    return null;
  }
  return {
    promptTokens: promptTokens ?? undefined,
    completionTokens: completionTokens ?? undefined,
    totalTokens: totalTokens ?? undefined,
    inputTokens: inputTokens ?? undefined,
    outputTokens: outputTokens ?? undefined,
  };
}

function extractRunCost(run: AgentRun): number | null {
  if (typeof run.cost === "number") {
    return run.cost;
  }
  if (isRecord(run.outputs) && typeof run.outputs.cost === "number") {
    return run.outputs.cost;
  }
  return null;
}

function formatUsageSummary(usage: RunUsage | null): string | null {
  if (!usage) {
    return null;
  }
  const prompt = usage.promptTokens ?? usage.inputTokens ?? null;
  const completion = usage.completionTokens ?? usage.outputTokens ?? null;
  const total = usage.totalTokens ?? null;
  if (total !== null) {
    if (prompt !== null && completion !== null) {
      return `${total} (prompt ${prompt} / completion ${completion})`;
    }
    return `${total}`;
  }
  if (prompt !== null && completion !== null) {
    return `${prompt + completion} (prompt ${prompt} / completion ${completion})`;
  }
  if (prompt !== null) {
    return `prompt ${prompt}`;
  }
  if (completion !== null) {
    return `completion ${completion}`;
  }
  return null;
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatRunDuration(run: AgentRun): string | null {
  const startedAt = Date.parse(run.startedAt ?? "");
  if (Number.isNaN(startedAt)) {
    return null;
  }
  const finishedAtRaw = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
  const finishedAt = Number.isNaN(finishedAtRaw) ? Date.now() : finishedAtRaw;
  const durationMs = Math.max(0, finishedAt - startedAt);
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  const durationSeconds = durationMs / 1000;
  if (durationSeconds < 60) {
    return `${durationSeconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function buildRunTraceEntries(run: AgentRun): Array<RunTraceEntry> {
  const events = [...(run.events ?? [])].sort((a, b) => {
    return Date.parse(a.timestamp) - Date.parse(b.timestamp);
  });
  return events.map((event) => {
    const chunk = extractStreamChunk(event.payload);
    const typeLabel = buildEventTypeLabel(event.type, chunk);
    const detail = buildEventDetail(event, chunk);
    return {
      id: event.id,
      timestamp: formatEventTimestamp(event.timestamp),
      type: typeLabel,
      detail,
    };
  });
}

function buildEventTypeLabel(
  eventType: string,
  chunk: StreamChunk | null,
): string {
  if (!chunk) {
    return eventType;
  }
  return `${eventType}/${chunk.type}`;
}

function buildEventDetail(
  event: RunEvent,
  chunk: StreamChunk | null,
): string | null {
  if (event.type === "run_failed") {
    const error = isRecord(event.payload)
      ? getString(event.payload.error)
      : null;
    if (error) {
      return `Error: ${error}`;
    }
  }
  if (event.type === "approval_request") {
    const payload =
      isRecord(event.payload) && isRecord(event.payload.payload)
        ? event.payload.payload
        : null;
    const toolName = payload ? getString(payload.toolName) : null;
    if (toolName) {
      return `Approval requested for ${toolName}`;
    }
    return "Approval requested";
  }
  if (!chunk) {
    return summarizePayload(event.payload);
  }
  if (isToolCallDelta(chunk)) {
    const toolName = chunk.tool_name ?? chunk.tool_call_id;
    const args = chunk.arguments_delta || "";
    return `Tool call ${toolName}: ${truncateText(args, 140)}`;
  }
  if (isToolResult(chunk)) {
    const result = chunk.result;
    const toolName = result.tool_name ?? result.tool_call_id;
    return `Tool result ${toolName}: ${truncateText(formatToolResult(result), 140)}`;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_START) {
    const role = extractMessageRole(chunk);
    if (role) {
      return `Message started (${role})`;
    }
    return "Message started";
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    return "Message finalized";
  }
  return null;
}

type StreamChunk = {
  type: string;
  [key: string]: unknown;
};

function extractStreamChunk(
  payload: Record<string, unknown>,
): StreamChunk | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload.chunk;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!("type" in raw)) {
    return null;
  }
  const typeValue = (raw as Record<string, unknown>).type;
  if (typeof typeValue !== "string") {
    return null;
  }
  return raw as StreamChunk;
}

function isToolCallDelta(chunk: StreamChunk): chunk is ToolCallDeltaEvent {
  return chunk.type === StreamingEventTypeEnum.TOOL_CALL_DELTA;
}

function isToolResult(chunk: StreamChunk): chunk is ToolResultEvent {
  return chunk.type === StreamingEventTypeEnum.TOOL_RESULT;
}

function extractMessageRole(chunk: StreamChunk): string | null {
  const message = chunk.message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const role = (message as Record<string, unknown>).role;
  if (typeof role === "string") {
    return role;
  }
  return null;
}

function formatToolResult(result: ToolChatMessage): string {
  const raw = result.result;
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  return "No result";
}

function formatEventTimestamp(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed).toLocaleTimeString();
}

function summarizePayload(
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload) {
    return null;
  }
  if ("error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return null;
  }
  if (keys.length <= 3) {
    return keys.join(", ");
  }
  return `${keys.slice(0, 3).join(", ")} +${keys.length - 3} more`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
