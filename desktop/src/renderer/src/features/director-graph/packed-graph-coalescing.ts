/**
 * The frame's backpressure rule.
 *
 * A live workstream does not deliver one fact per frame: parallel lanes commit
 * together and a reconnect replays a durable backlog at once. A frame applies at
 * most one batch, and applying the coalesced batch must land on the same columns
 * that applying its parts one at a time would.
 *
 * This is production graph state, so it lives apart from the fixtures that
 * reproduce arrival patterns to measure it. The canvas must not reach demo data
 * to find the rule it runs every frame.
 */

import type {
  PackedGraphBatch,
  PackedGraphEdgeInput,
  PackedGraphNodeInput,
  PackedGraphTurnInput,
} from "./packed-graph-snapshot";

/** One frame at the 120 Hz target. */
export const packedGraphFrameBudgetMs = 1000 / 120;

/**
 * Merges a group of pushed batches into the single batch a frame applies.
 * Turn records are keyed by index, so a turn updated twice inside one frame
 * lands once, in its final state.
 */
export function coalescePackedGraphBatches(batches: readonly PackedGraphBatch[]): PackedGraphBatch {
  const last = batches[batches.length - 1];
  if (last === undefined) {
    throw new Error("cannot coalesce an empty batch group");
  }
  const nodes: PackedGraphNodeInput[] = [];
  const edges: PackedGraphEdgeInput[] = [];
  const turns = new Map<number, PackedGraphTurnInput>();
  for (const batch of batches) {
    for (const node of batch.nodes) {
      nodes.push(node);
    }
    for (const edge of batch.edges) {
      edges.push(edge);
    }
    for (const turn of batch.turns) {
      turns.set(turn.index, turn);
    }
  }
  return {
    cursorSequence: last.cursorSequence,
    hasEarlier: last.hasEarlier,
    nodes,
    edges,
    turns: [...turns.values()].sort((left, right) => left.index - right.index),
  };
}
