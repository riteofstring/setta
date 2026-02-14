import {
  AgentRun,
  AgentRunStatusEnum,
  BaseChatMessageUnion,
} from "utils/generatedTypes";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";

type ChatTitleSource = "llm" | "deterministic" | "reused" | "external";

type ChatHistoryEntry = {
  chatId: string;
  label: string;
  nameSource: ChatTitleSource | null;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

type ChatRunSummary = {
  latestRun: AgentRun;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

type BuildChatHistoryEntriesOptions = {
  sectionId?: string | null;
};

export function buildChatHistoryEntries(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions = {},
): Array<ChatHistoryEntry> {
  const sectionId = normalizeRunSectionId(options.sectionId ?? null);
  const branchChatIds = new Set<string>();
  for (const run of runs) {
    if (!isChatRun(run)) {
      continue;
    }
    if (sectionId && getRunSectionId(run) !== sectionId) {
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

  const grouped = new Map<string, ChatRunSummary>();
  for (const run of runs) {
    if (!isChatRun(run)) {
      continue;
    }
    if (sectionId && getRunSectionId(run) !== sectionId) {
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

  const entries: Array<ChatHistoryEntry> = [];
  for (const [runChatId, summary] of grouped.entries()) {
    entries.push({
      chatId: runChatId,
      label: deriveChatLabel(summary.latestRun, runChatId),
      nameSource: deriveChatNameSource(summary.latestRun),
      lastUpdatedMs: summary.lastUpdatedMs,
      waitingForResponse: summary.waitingForResponse,
    });
  }
  return entries;
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

function isChatRun(run: AgentRun): boolean {
  const runType = getRunInputString(run, "runType");
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
  const branchParentChatId = getRunInputString(run, "branchParentChatId");
  if (branchParentChatId) {
    return true;
  }
  return false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
