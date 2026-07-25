/**
 * Burst-update fixtures for the packed GPU snapshot boundary.
 *
 * A live workstream does not deliver one fact per frame. Parallel lanes commit
 * together, a reconnect replays a backlog from a durable cursor, and a fast
 * provider can push a dozen batches inside a single 120 Hz frame. These
 * fixtures reproduce those arrival patterns so the renderer can be measured
 * against them before it is wired to a live subscription.
 *
 * Coalescing is the rule the boundary enforces: a frame applies at most one
 * batch, and applying the coalesced batch must land on the same columns that
 * applying its parts one at a time would.
 */

import {
  buildPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphEdgeInput,
  type PackedGraphNodeInput,
  type PackedGraphSnapshot,
  type PackedGraphTurnInput,
} from "./packed-graph-snapshot";
import { packedGraphFixtureBatches } from "./packed-graph-fixtures";
import { packedGraphScene, type PackedGraphFixtureName } from "./packed-graph-scenes";

/** One frame at the 120 Hz target. */
export const packedGraphFrameBudgetMs = 1000 / 120;

export interface PackedGraphDelivery {
  readonly deliveredAtMs: number;
  readonly batch: PackedGraphBatch;
}

export interface PackedGraphBurst {
  readonly workstreamId: string;
  readonly profile: PackedGraphBurstProfile;
  readonly deliveries: readonly PackedGraphDelivery[];
}

export const packedGraphBurstProfiles = [
  /** Every batch lands inside one frame: the worst case for coalescing. */
  "storm",
  /** One batch per frame, the ordinary live cadence. */
  "steady",
  /** Silence, then a durable-cursor backlog arrives at once. */
  "replay-catch-up",
] as const;
export type PackedGraphBurstProfile = (typeof packedGraphBurstProfiles)[number];

function deliveryTime(profile: PackedGraphBurstProfile, index: number, total: number): number {
  switch (profile) {
    case "storm":
      return (packedGraphFrameBudgetMs * index) / Math.max(1, total);
    case "steady":
      return packedGraphFrameBudgetMs * index;
    case "replay-catch-up":
      return index === 0 ? 0 : packedGraphFrameBudgetMs * 40;
    default: {
      const unreachable: never = profile;
      throw new Error(`unsupported burst profile ${String(unreachable)}`);
    }
  }
}

/** Schedules a fixture's batch stream onto one of the arrival patterns. */
export function packedGraphBurst(
  name: PackedGraphFixtureName,
  profile: PackedGraphBurstProfile,
): PackedGraphBurst {
  const batches = packedGraphFixtureBatches(name);
  const first = batches[0];
  if (first === undefined) {
    throw new Error(`fixture ${name} produced no batches`);
  }
  return {
    workstreamId: packedGraphScene(name).workstreamId,
    profile,
    deliveries: batches.map((batch, index) => ({
      deliveredAtMs: deliveryTime(profile, index, batches.length),
      batch,
    })),
  };
}

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

/**
 * Groups deliveries into frames and coalesces each frame's arrivals. This is
 * what keeps a burst from producing one snapshot — and one upload — per pushed
 * event.
 */
export function coalesceDeliveriesByFrame(
  deliveries: readonly PackedGraphDelivery[],
  frameBudgetMs: number = packedGraphFrameBudgetMs,
): readonly PackedGraphBatch[] {
  const frames = new Map<number, PackedGraphBatch[]>();
  for (const delivery of deliveries) {
    const frame = Math.floor(delivery.deliveredAtMs / frameBudgetMs);
    const group = frames.get(frame);
    if (group === undefined) {
      frames.set(frame, [delivery.batch]);
      continue;
    }
    group.push(delivery.batch);
  }
  return [...frames.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, group]) => coalescePackedGraphBatches(group));
}

/** The batches a subscriber still needs after resuming from a cursor. */
export function packedGraphBatchesAfter(
  burst: PackedGraphBurst,
  cursorSequence: number,
): readonly PackedGraphBatch[] {
  return burst.deliveries
    .map((delivery) => delivery.batch)
    .filter((batch) => batch.cursorSequence > cursorSequence);
}

/** The snapshot a subscriber holds at a durable cursor. */
export function packedGraphSnapshotAtCursor(
  burst: PackedGraphBurst,
  cursorSequence: number,
): PackedGraphSnapshot {
  const batches = burst.deliveries
    .map((delivery) => delivery.batch)
    .filter((batch) => batch.cursorSequence <= cursorSequence);
  return buildPackedGraphSnapshot(burst.workstreamId, batches);
}

/**
 * Resumes a subscription: takes the snapshot held at a cursor and applies the
 * backlog after it. The result must match a cold build of the whole stream.
 */
export function resumePackedGraphBurst(
  burst: PackedGraphBurst,
  cursorSequence: number,
): PackedGraphSnapshot {
  let snapshot = packedGraphSnapshotAtCursor(burst, cursorSequence);
  for (const batch of packedGraphBatchesAfter(burst, cursorSequence)) {
    snapshot = extendPackedGraphSnapshot(snapshot, batch);
  }
  return snapshot;
}
