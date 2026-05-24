import {
  AgentRun,
  BaseChatMessageUnion,
  ChatRunTypesByName,
  RunStatusEnum,
} from "utils/generatedTypes";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";

type ChatTitleSource = "llm" | "deterministic" | "reused" | "external";
export type ChatRunType = keyof typeof ChatRunTypesByName;
type ChatRunProvenance = {
  runType: ChatRunType;
  engineConfigId: string | null;
};

type ScopedChatProvenanceLookupResult =
  | {
      status: "ready";
      provenance: ChatRunProvenance;
    }
  | {
      status: "missing";
    }
  | {
      status: "ambiguous";
    };

type ChatHistoryEntry = {
  chatId: string;
  label: string;
  nameSource: ChatTitleSource | null;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
  runType: ChatRunType | null;
  engineConfigId: string | null;
};

type ChatRunSummary = {
  latestRun: AgentRun;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

type ChatRunSummaryFilter = {
  projectConfigId: string | null;
  sectionId: string | null;
  unscopedOnly: boolean;
};

type ChatRunProvenanceCandidate = {
  runType: ChatRunType;
  engineConfigId: string | null;
  lastUpdatedMs: number;
};

type ChatRunSummaryCandidate = {
  runChatId: string;
  summary: ChatRunSummary;
};

type BuildChatHistoryEntriesOptions = {
  sectionId?: string | null | undefined;
  unscopedOnly?: boolean | undefined;
  projectConfigId?: string | null | undefined;
};

export function buildChatHistoryEntries(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions = {},
): Array<ChatHistoryEntry> {
  const grouped = collectChatRunSummaries(runs, options, false);

  const entries: Array<ChatHistoryEntry> = [];
  for (const [runChatId, summary] of grouped.entries()) {
    entries.push({
      chatId: runChatId,
      label: deriveChatLabel(summary.latestRun, runChatId),
      nameSource: deriveChatNameSource(summary.latestRun),
      lastUpdatedMs: summary.lastUpdatedMs,
      waitingForResponse: summary.waitingForResponse,
      runType: getRunType(summary.latestRun),
      engineConfigId: getRunInputString(summary.latestRun, "engineConfigId"),
    });
  }
  return entries;
}

export function buildChatProvenanceByChatId(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions = {},
): Map<string, ChatRunProvenance> {
  const grouped = collectChatRunSummaries(runs, options, true);
  const provenance = new Map<string, ChatRunProvenance>();
  for (const [runChatId, summary] of grouped.entries()) {
    const runType = getRunType(summary.latestRun);
    if (!runType) {
      continue;
    }
    provenance.set(runChatId, {
      runType,
      engineConfigId: getRunInputString(summary.latestRun, "engineConfigId"),
    });
  }
  return provenance;
}

export function resolveScopedChatProvenanceForChatId(
  runs: Array<AgentRun>,
  {
    chatId,
    projectConfigId,
    sectionId,
    unscopedOnly,
  }: {
    chatId: string;
    projectConfigId?: string | null;
    sectionId?: string | null;
    unscopedOnly?: boolean;
  },
): ScopedChatProvenanceLookupResult {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return { status: "missing" };
  }
  const filter = createChatRunSummaryFilter({
    projectConfigId,
    sectionId,
    unscopedOnly,
  });
  const candidates = collectScopedChatProvenanceCandidates(
    runs,
    normalizedChatId,
    filter,
  );
  return resolveScopedChatProvenanceCandidates(candidates);
}

function collectScopedChatProvenanceCandidates(
  runs: Array<AgentRun>,
  normalizedChatId: string,
  filter: ChatRunSummaryFilter,
): Array<ChatRunProvenanceCandidate> {
  const candidates: Array<ChatRunProvenanceCandidate> = [];
  for (const run of runs) {
    const candidate = toScopedChatProvenanceCandidate(
      run,
      normalizedChatId,
      filter,
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function toScopedChatProvenanceCandidate(
  run: AgentRun,
  normalizedChatId: string,
  filter: ChatRunSummaryFilter,
): ChatRunProvenanceCandidate | null {
  if (getRunChatId(run) !== normalizedChatId) {
    return null;
  }
  if (!shouldCollectRunForChatSummary(run, filter)) {
    return null;
  }
  const runType = getRunType(run);
  if (!runType) {
    return null;
  }
  return {
    runType,
    engineConfigId: getRunInputString(run, "engineConfigId"),
    lastUpdatedMs: getRunLastUpdatedMs(run),
  };
}

function resolveScopedChatProvenanceCandidates(
  candidates: Array<ChatRunProvenanceCandidate>,
): ScopedChatProvenanceLookupResult {
  if (candidates.length === 0) {
    return { status: "missing" };
  }
  const latestUpdatedMs = Math.max(
    ...candidates.map((candidate) => candidate.lastUpdatedMs),
  );
  const latestCandidates = candidates.filter(
    (candidate) => candidate.lastUpdatedMs === latestUpdatedMs,
  );
  const distinctLatestProvenance = new Set(
    latestCandidates.map(
      (candidate) =>
        `${candidate.runType}:${candidate.engineConfigId ?? "__none__"}`,
    ),
  );
  if (distinctLatestProvenance.size > 1) {
    return { status: "ambiguous" };
  }
  const [latestCandidate] = latestCandidates;
  if (!latestCandidate) {
    return { status: "missing" };
  }
  return {
    status: "ready",
    provenance: {
      runType: latestCandidate.runType,
      engineConfigId: latestCandidate.engineConfigId,
    },
  };
}

function collectChatRunSummaries(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions,
  includeBranchChats: boolean,
): Map<string, ChatRunSummary> {
  const filter = createChatRunSummaryFilter(options);
  const branchChatIds = includeBranchChats
    ? new Set<string>()
    : collectBranchChatIds(runs, filter);
  const grouped = new Map<string, ChatRunSummary>();
  for (const run of runs) {
    const candidate = buildChatRunSummaryCandidate(run, filter, branchChatIds);
    if (candidate) {
      upsertChatRunSummary(grouped, candidate.runChatId, candidate.summary);
    }
  }
  return grouped;
}

function createChatRunSummaryFilter(
  options: BuildChatHistoryEntriesOptions,
): ChatRunSummaryFilter {
  return {
    projectConfigId: normalizeProjectConfigId(options.projectConfigId ?? null),
    sectionId: normalizeRunSectionId(options.sectionId ?? null),
    unscopedOnly: options.unscopedOnly === true,
  };
}

function buildChatRunSummaryCandidate(
  run: AgentRun,
  filter: ChatRunSummaryFilter,
  branchChatIds: Set<string>,
): ChatRunSummaryCandidate | null {
  if (!shouldCollectRunForChatSummary(run, filter)) {
    return null;
  }
  const runChatId = getRunChatId(run);
  if (!runChatId || branchChatIds.has(runChatId)) {
    return null;
  }
  return {
    runChatId,
    summary: {
      latestRun: run,
      lastUpdatedMs: getRunLastUpdatedMs(run),
      waitingForResponse: run.status === RunStatusEnum.running,
    },
  };
}

function upsertChatRunSummary(
  grouped: Map<string, ChatRunSummary>,
  runChatId: string,
  summary: ChatRunSummary,
): void {
  const existing = grouped.get(runChatId);
  if (existing && summary.lastUpdatedMs < existing.lastUpdatedMs) {
    return;
  }
  grouped.set(runChatId, summary);
}

function shouldCollectRunForChatSummary(
  run: AgentRun,
  options: ChatRunSummaryFilter,
): boolean {
  if (!isChatRun(run)) {
    return false;
  }
  if (
    options.projectConfigId !== null &&
    getRunInputString(run, "projectConfigId") !== options.projectConfigId
  ) {
    return false;
  }
  if (options.unscopedOnly && getRunSectionId(run) !== null) {
    return false;
  }
  if (options.sectionId && getRunSectionId(run) !== options.sectionId) {
    return false;
  }
  return true;
}

function collectBranchChatIds(
  runs: Array<AgentRun>,
  options: ChatRunSummaryFilter,
): Set<string> {
  const branchChatIds = new Set<string>();
  for (const run of runs) {
    if (!shouldCollectRunForChatSummary(run, options)) {
      continue;
    }
    if (!isBranchRun(run)) {
      continue;
    }
    const runChatId = getRunChatId(run);
    if (runChatId) {
      branchChatIds.add(runChatId);
    }
  }
  return branchChatIds;
}

function normalizeRunSectionId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeProjectConfigId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function getRunSectionId(run: AgentRun): string | null {
  return getRunInputString(run, "sectionId");
}

function deriveChatNameSource(run: AgentRun): ChatTitleSource | null {
  const nameSource = getRunOutputString(run, "nameSource");
  if (
    nameSource === "llm" ||
    nameSource === "deterministic" ||
    nameSource === "reused" ||
    nameSource === "external"
  ) {
    return nameSource;
  }
  return null;
}

function getRunChatId(run: AgentRun): string | null {
  return getRunInputString(run, "chatId");
}

function getRunType(run: AgentRun): ChatRunType | null {
  return parseChatRunType(getRunInputString(run, "runType"));
}

function parseChatRunType(runType: string | null): ChatRunType | null {
  if (!runType || !isChatRunType(runType)) {
    return null;
  }
  return runType;
}

function isChatRunType(value: string): value is ChatRunType {
  return Object.prototype.hasOwnProperty.call(ChatRunTypesByName, value);
}

function isChatRun(run: AgentRun): boolean {
  return getRunType(run) !== null;
}

function isBranchRun(run: AgentRun): boolean {
  const branchParentChatId = getRunInputString(run, "branchParentChatId");
  if (branchParentChatId) {
    return true;
  }
  return false;
}

function deriveChatLabel(run: AgentRun, chatId: string): string {
  const outputName = getRunOutputString(run, "name");
  if (outputName) {
    const normalizedOutputName = normalizeChatLabelText(outputName);
    if (normalizedOutputName) {
      return normalizedOutputName;
    }
  }
  const messages = getRunMessages(run);
  const firstText = extractFirstMessageText(messages);
  if (firstText) {
    const normalizedFirstText = normalizeChatLabelText(firstText);
    if (normalizedFirstText) {
      return normalizedFirstText.slice(0, 30);
    }
  }
  return `Chat ${chatId.slice(0, 8)}`;
}

function normalizeChatLabelText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const withoutUserPrefix = trimmed.replace(/^User:\s*/iu, "");
  if (withoutUserPrefix.trim().length > 0) {
    return withoutUserPrefix.trim();
  }
  return trimmed;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
