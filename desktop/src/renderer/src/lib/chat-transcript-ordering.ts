import type { TranscriptTurn } from "@generated/backend";

export function compareTranscriptTurns(left: TranscriptTurn, right: TranscriptTurn) {
  const ordinalDelta = transcriptTurnSortOrdinal(left) - transcriptTurnSortOrdinal(right);
  if (ordinalDelta !== 0) {
    return ordinalDelta;
  }
  return left.run.id.localeCompare(right.run.id);
}

export function transcriptTurnSortOrdinal(turn: TranscriptTurn) {
  if (turn.triggerMessage.delivery === "queued" && turn.assistantMessage) {
    return turn.assistantMessage.ordinal;
  }
  return turn.triggerMessage.ordinal;
}
