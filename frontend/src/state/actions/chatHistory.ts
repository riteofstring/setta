import {
  AgentRun,
  AgentRunStatusEnum,
  BaseChatMessageUnion,
} from "utils/generatedTypes";

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

export function buildChatHistoryEntries(
  runs: Array<AgentRun>,
): Array<ChatHistoryEntry> {
  const branchChatIds = new Set<string>();
  for (const run of runs) {
    if (!isChatRun(run)) {
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
      lastUpdatedMs: summary.lastUpdatedMs,
      waitingForResponse: summary.waitingForResponse,
    });
  }
  return entries;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
