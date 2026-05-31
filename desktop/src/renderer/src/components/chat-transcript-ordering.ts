import type { TranscriptTurn } from "@generated/backend";

export function transcriptTurnSortOrdinal(turn: TranscriptTurn) {
  if (turn.triggerMessage.delivery === "queued" && turn.assistantMessage) {
    return turn.assistantMessage.ordinal;
  }
  return turn.triggerMessage.ordinal;
}
