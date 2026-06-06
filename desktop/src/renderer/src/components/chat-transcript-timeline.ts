import type { ChatMessage, TranscriptTurn } from "@generated/backend";

import { transcriptTurnSortOrdinal } from "../lib/chat-transcript-ordering";

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
    };

type TranscriptTimelineEntry =
  | Omit<Extract<TranscriptTimelineRow, { kind: "message" }>, "index">
  | Omit<Extract<TranscriptTimelineRow, { kind: "turn" }>, "index">;

export function transcriptTimelineRows(source: TranscriptTimelineSource): TranscriptTimelineRow[] {
  const turnMessageIds = new Set<string>();
  const entries: TranscriptTimelineEntry[] = [];
  for (const turn of source.turns) {
    turnMessageIds.add(turn.triggerMessage.id);
    if (turn.assistantMessage) {
      turnMessageIds.add(turn.assistantMessage.id);
    }
    addSteeringTimelineEntries(entries, turn.steeringMessages);
    entries.push({
      key: `turn:${turn.run.id}`,
      kind: "turn",
      messageIds: transcriptTurnMessageIds(turn),
      sortOrdinal: transcriptTurnSortOrdinal(turn),
      turn,
    });
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
