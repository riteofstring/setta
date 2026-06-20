import type { ChatMessage, TranscriptTurn } from "@generated/backend";

import { chatMessageText } from "./chat-message-text";
import { transcriptTurnSortOrdinal } from "../lib/chat-transcript-ordering";

const assistantTextChunkLength = 1800;
const assistantTextChunkThreshold = assistantTextChunkLength * 2;

export interface TranscriptTimelineSource {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  turns: TranscriptTurn[];
}

export type TranscriptTimelineRow =
  | {
      index: number;
      key: string;
      kind: "message";
      message: ChatMessage;
      messageIds: string[];
      sortOrdinal: number;
    }
  | {
      index: number;
      key: string;
      kind: "turn";
      messageIds: string[];
      sortOrdinal: number;
      turn: TranscriptTurn;
    }
  | {
      index: number;
      key: string;
      kind: "turn-message";
      message: ChatMessage;
      messageIds: string[];
      sortOrdinal: number;
      turn: TranscriptTurn;
    }
  | {
      chunk: TranscriptAssistantMessageChunk;
      index: number;
      key: string;
      kind: "assistant-chunk";
      message: ChatMessage;
      messageIds: string[];
      sortOrdinal: number;
      turn: TranscriptTurn;
    };

type TranscriptTimelineEntry =
  | Omit<Extract<TranscriptTimelineRow, { kind: "message" }>, "index">
  | Omit<Extract<TranscriptTimelineRow, { kind: "turn" }>, "index">
  | Omit<Extract<TranscriptTimelineRow, { kind: "turn-message" }>, "index">
  | Omit<Extract<TranscriptTimelineRow, { kind: "assistant-chunk" }>, "index">;

export interface TranscriptAssistantMessageChunk {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  text: string;
}

export function transcriptTimelineRows(source: TranscriptTimelineSource): TranscriptTimelineRow[] {
  const turnMessageIds = new Set<string>();
  const entries: TranscriptTimelineEntry[] = [];
  for (const turn of source.turns) {
    turnMessageIds.add(turn.triggerMessage.id);
    if (turn.assistantMessage) {
      turnMessageIds.add(turn.assistantMessage.id);
    }
    addSteeringTimelineEntries(entries, turn.steeringMessages);
    addTurnTimelineEntry(entries, turn);
  }
  for (const messageId of source.messageIds) {
    const message = source.messagesById[messageId];
    if (
      !message ||
      message.runId !== "" ||
      turnMessageIds.has(message.id) ||
      !isVisibleMessage(message)
    ) {
      continue;
    }
    entries.push({
      key: `message:${message.id}`,
      kind: "message",
      message,
      messageIds: [message.id],
      sortOrdinal: message.ordinal,
    });
  }
  return entries
    .toSorted((left, right) => {
      if (left.sortOrdinal === right.sortOrdinal) {
        return left.key.localeCompare(right.key);
      }
      return left.sortOrdinal - right.sortOrdinal;
    })
    .map((entry, index) => ({ ...entry, index }));
}

function addTurnTimelineEntry(entries: TranscriptTimelineEntry[], turn: TranscriptTurn) {
  const assistantMessage = turn.assistantMessage;
  const assistantChunks = assistantMessage ? assistantMessageChunks(assistantMessage) : null;
  if (!assistantChunks || !assistantMessage) {
    entries.push({
      key: `turn:${turn.run.id}`,
      kind: "turn",
      messageIds: transcriptTurnMessageIds(turn),
      sortOrdinal: transcriptTurnSortOrdinal(turn),
      turn,
    });
    return;
  }

  const sortOrdinal = transcriptTurnSortOrdinal(turn);
  if (isVisibleMessage(turn.triggerMessage)) {
    entries.push({
      key: `turn:${turn.run.id}:00-trigger`,
      kind: "turn-message",
      message: turn.triggerMessage,
      messageIds: [turn.triggerMessage.id],
      sortOrdinal,
      turn,
    });
  }
  const message = assistantMessage;
  for (const chunk of assistantChunks) {
    entries.push({
      chunk,
      key: `turn:${turn.run.id}:10-assistant:${String(chunk.index).padStart(4, "0")}`,
      kind: "assistant-chunk",
      message,
      messageIds: [message.id],
      sortOrdinal,
      turn,
    });
  }
}

function addSteeringTimelineEntries(entries: TranscriptTimelineEntry[], messages: ChatMessage[]) {
  for (const message of messages) {
    if (isVisibleMessage(message)) {
      entries.push({
        key: `message:${message.id}`,
        kind: "message",
        message,
        messageIds: [message.id],
        sortOrdinal: message.ordinal,
      });
    }
  }
}

function assistantMessageChunks(message: ChatMessage): TranscriptAssistantMessageChunk[] | null {
  if (message.role !== "assistant") {
    return null;
  }
  const text = chatMessageText(message);
  if (text.length < assistantTextChunkThreshold || hasChunkUnsafeMarkdownSyntax(text)) {
    return null;
  }
  const chunks: TranscriptAssistantMessageChunk[] = [];
  for (let start = 0; start < text.length; start += assistantTextChunkLength) {
    const index = chunks.length;
    chunks.push({
      index,
      isFirst: index === 0,
      isLast: false,
      text: text.slice(start, start + assistantTextChunkLength),
    });
  }
  const lastChunk = chunks.at(-1);
  if (lastChunk) {
    lastChunk.isLast = true;
  }
  return chunks;
}

function hasChunkUnsafeMarkdownSyntax(text: string) {
  return text.includes("`") || text.includes("**");
}

function transcriptTurnMessageIds(turn: TranscriptTurn) {
  const ids: string[] = [];
  if (isVisibleMessage(turn.triggerMessage)) {
    ids.push(turn.triggerMessage.id);
  }
  if (turn.assistantMessage && isVisibleMessage(turn.assistantMessage)) {
    ids.push(turn.assistantMessage.id);
  }
  return ids;
}

export function timelineRowForMessage(timeline: TranscriptTimelineRow[], messageId: string) {
  return timeline.find((row) => row.messageIds.includes(messageId)) ?? null;
}

export function isVisibleMessage(message: ChatMessage) {
  return message.delivery !== "goal";
}
