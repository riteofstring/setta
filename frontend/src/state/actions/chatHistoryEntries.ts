import { AgentRun, BaseChatMessageUnion } from "utils/generatedTypes";
import {
  collectChatRunSummaries,
  getRunEngineConfigId,
  getRunType,
} from "./chatHistoryShared";
import type {
  BuildChatHistoryEntriesOptions,
  ChatHistoryEntry,
  ChatTitleSource,
} from "./chatHistoryTypes";

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
      engineConfigId: getRunEngineConfigId(summary.latestRun),
    });
  }
  return entries;
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

function deriveChatLabel(run: AgentRun, chatId: string): string {
  const outputName = getRunOutputString(run, "name");
  if (outputName) {
    const normalizedOutputName = normalizeChatLabelText(outputName);
    if (normalizedOutputName) {
      return normalizedOutputName;
    }
  }
  const firstText = extractFirstMessageText(getRunMessages(run));
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
  if (withoutUserPrefix.trim()) {
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
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      if (!isRecord(block) || block.type !== "text") {
        continue;
      }
      if (typeof block.text === "string" && block.text.trim()) {
        return block.text.trim();
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
