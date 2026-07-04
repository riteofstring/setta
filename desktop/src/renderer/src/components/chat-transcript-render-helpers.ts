import type { ChatMessage } from "@generated/backend";

import { isVisibleMessage, type TranscriptTimelineRow } from "./chat-transcript-timeline";

export interface StableTranscriptTimelineRowsState {
  byKey: Map<string, TranscriptTimelineRow>;
  result: TranscriptTimelineRow[];
}

export function stableTranscriptTimelineRows(
  rows: TranscriptTimelineRow[],
  previous: StableTranscriptTimelineRowsState,
): StableTranscriptTimelineRowsState {
  const byKey = new Map<string, TranscriptTimelineRow>();
  let anyChanged = rows.length !== previous.result.length;
  const result = rows.map((row, index) => {
    const previousRow = previous.byKey.get(row.key);
    const nextRow =
      previousRow && transcriptTimelineRowUnchanged(previousRow, row) ? previousRow : row;
    byKey.set(row.key, nextRow);
    if (!anyChanged && previous.result[index] !== nextRow) {
      anyChanged = true;
    }
    return nextRow;
  });
  return anyChanged ? { byKey, result } : previous;
}

export function timestampMessageIdsForTimeline(timeline: TranscriptTimelineRow[]) {
  const messages = visibleMessagesForTimeline(timeline);
  const timestampMessageIds = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const nextMessage = messages[index + 1] ?? null;
    if (!nextMessage || timestampGroupKey(message) !== timestampGroupKey(nextMessage)) {
      timestampMessageIds.add(message.id);
    }
  }
  return timestampMessageIds;
}

function transcriptTimelineRowUnchanged(
  previous: TranscriptTimelineRow,
  next: TranscriptTimelineRow,
) {
  if (!transcriptTimelineRowIdentityUnchanged(previous, next)) {
    return false;
  }
  return transcriptTimelineRowValueUnchanged(previous, next);
}

function transcriptTimelineRowIdentityUnchanged(
  previous: TranscriptTimelineRow,
  next: TranscriptTimelineRow,
) {
  if (
    previous.kind !== next.kind ||
    previous.index !== next.index ||
    previous.key !== next.key ||
    previous.sortOrdinal !== next.sortOrdinal
  ) {
    return false;
  }
  return true;
}

function transcriptTimelineRowValueUnchanged(
  previous: TranscriptTimelineRow,
  next: TranscriptTimelineRow,
) {
  switch (previous.kind) {
    case "message":
      return previous.message === (next as typeof previous).message;
    case "turn":
      return previous.turn === (next as typeof previous).turn;
    case "turn-message":
      return previous.message === (next as typeof previous).message;
    case "assistant-chunk":
      return assistantChunkTimelineRowUnchanged(previous, next as typeof previous);
    default:
      return assertNever(previous);
  }
}

function assistantChunkTimelineRowUnchanged(
  previous: Extract<TranscriptTimelineRow, { kind: "assistant-chunk" }>,
  next: Extract<TranscriptTimelineRow, { kind: "assistant-chunk" }>,
) {
  if (!assistantChunkTimelineValueUnchanged(previous, next)) {
    return false;
  }
  return !previous.chunk.isLast || previous.message === next.message;
}

function assistantChunkTimelineValueUnchanged(
  previous: Extract<TranscriptTimelineRow, { kind: "assistant-chunk" }>,
  next: Extract<TranscriptTimelineRow, { kind: "assistant-chunk" }>,
) {
  return (
    previous.chunk.isFirst === next.chunk.isFirst &&
    previous.chunk.isLast === next.chunk.isLast &&
    previous.chunk.text === next.chunk.text &&
    previous.message.id === next.message.id &&
    previous.message.role === next.message.role &&
    previous.message.delivery === next.message.delivery
  );
}

function visibleMessagesForTimeline(timeline: TranscriptTimelineRow[]) {
  const messages: ChatMessage[] = [];
  for (const row of timeline) {
    if (row.kind === "message") {
      messages.push(row.message);
      continue;
    }
    if (row.kind === "turn-message") {
      messages.push(row.message);
      continue;
    }
    if (row.kind === "assistant-chunk") {
      if (row.chunk.isLast) {
        messages.push(row.message);
      }
      continue;
    }
    if (isVisibleMessage(row.turn.triggerMessage)) {
      messages.push(row.turn.triggerMessage);
    }
    if (row.turn.assistantMessage && isVisibleMessage(row.turn.assistantMessage)) {
      messages.push(row.turn.assistantMessage);
    }
  }
  return messages;
}

function timestampGroupKey(message: ChatMessage) {
  return message.role === "user" ? "user" : "ai";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript timeline row: ${JSON.stringify(value)}`);
}
