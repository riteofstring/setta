import {
  AgentRun,
  AgentRunStatusEnum,
  BaseChatMessageUnion,
} from "utils/generatedTypes";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";

type ChatTitleSource = "llm" | "deterministic" | "reused" | "external";
export type ChatRunType = "llm_chat" | "external_agent" | "scriptable_chat";
export type ChatHistoryCompatibility = {
  runType: ChatRunType;
  engineConfigId: string | null;
};
export type ChatRunProvenance = {
  runType: ChatRunType;
  engineConfigId: string | null;
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

type BuildChatHistoryEntriesOptions = {
  sectionId?: string | null;
  unscopedOnly?: boolean;
  compatibility?: ChatHistoryCompatibility | null;
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

function collectChatRunSummaries(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions,
  includeBranchChats: boolean,
): Map<string, ChatRunSummary> {
  const sectionId = normalizeRunSectionId(options.sectionId ?? null);
  const unscopedOnly = options.unscopedOnly === true;
  const compatibility = options.compatibility ?? null;
  const branchChatIds = includeBranchChats
    ? new Set<string>()
    : collectBranchChatIds(runs, {
        sectionId,
        unscopedOnly,
        compatibility,
      });
  const grouped = new Map<string, ChatRunSummary>();
  for (const run of runs) {
    if (
      !shouldCollectRunForChatSummary(run, {
        sectionId,
        unscopedOnly,
        compatibility,
      })
    ) {
      continue;
    }
    const runChatId = getRunChatId(run);
    if (!runChatId) {
      continue;
    }
    if (branchChatIds.has(runChatId)) {
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
  return grouped;
}

function shouldCollectRunForChatSummary(
  run: AgentRun,
  options: {
    sectionId: string | null;
    unscopedOnly: boolean;
    compatibility: ChatHistoryCompatibility | null;
  },
): boolean {
  if (!isChatRun(run)) {
    return false;
  }
  if (!isRunCompatibleWithHistoryFilter(run, options.compatibility)) {
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
  options: {
    sectionId: string | null;
    unscopedOnly: boolean;
    compatibility: ChatHistoryCompatibility | null;
  },
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
  const runType = getRunInputString(run, "runType");
  if (
    runType === "llm_chat" ||
    runType === "external_agent" ||
    runType === "scriptable_chat"
  ) {
    return runType;
  }
  return null;
}

function isChatRun(run: AgentRun): boolean {
  return getRunType(run) !== null;
}

function isRunCompatibleWithHistoryFilter(
  run: AgentRun,
  compatibility: ChatHistoryCompatibility | null,
): boolean {
  if (!compatibility) {
    return true;
  }
  const runType = getRunType(run);
  if (runType !== compatibility.runType) {
    return false;
  }
  if (!compatibility.engineConfigId) {
    return true;
  }
  return (
    getRunInputString(run, "engineConfigId") === compatibility.engineConfigId
  );
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
