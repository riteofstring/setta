import type { TranscriptTurn } from "@generated/backend";

// Legacy turn-ordering helper still consumed by the pre-cutover chat transcript
// timeline component; superseded by the block ordering in ./chat-transcript-blocks
// (orderTranscriptBlocks). Removed together with chat-transcript-timeline in Phase 5.
export function transcriptTurnSortOrdinal(turn: TranscriptTurn) {
  if (turn.triggerMessage.delivery === "queued" && turn.assistantMessage) {
    return turn.assistantMessage.ordinal;
  }
  return turn.triggerMessage.ordinal;
}
