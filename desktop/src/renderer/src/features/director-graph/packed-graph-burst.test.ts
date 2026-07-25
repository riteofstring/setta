import { describe, expect, it } from "vitest";

import {
  coalesceDeliveriesByFrame,
  coalescePackedGraphBatches,
  packedGraphBatchesAfter,
  packedGraphBurst,
  packedGraphBurstProfiles,
  packedGraphFrameBudgetMs,
  packedGraphSnapshotAtCursor,
  resumePackedGraphBurst,
} from "./packed-graph-burst";
import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphSnapshot,
} from "./packed-graph-snapshot";
import { packedGraphFixtureBatches } from "./packed-graph-fixtures";

const fixtureName = "branch-merge-and-dead-end";

/**
 * Every column except `changed`, which legitimately differs between applying
 * batches one at a time and applying the batch a frame coalesced them into.
 */
function columnDigest(snapshot: PackedGraphSnapshot): string {
  const group = (columns: object): Record<string, unknown> => {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(columns)) {
      output[key] = ArrayBuffer.isView(value)
        ? Array.from(value as unknown as ArrayLike<number>)
        : value;
    }
    return output;
  };
  return JSON.stringify({
    workstreamId: snapshot.workstreamId,
    cursorSequence: snapshot.cursorSequence,
    hasEarlier: snapshot.hasEarlier,
    nodeCount: snapshot.nodeCount,
    edgeCount: snapshot.edgeCount,
    turnCount: snapshot.turnCount,
    nodes: group(snapshot.nodes),
    edges: group(snapshot.edges),
    turns: group(snapshot.turns),
  });
}

describe("packed graph burst delivery", () => {
  it.each(packedGraphBurstProfiles)(
    "delivers the whole batch stream on the %s profile",
    (profile) => {
      const burst = packedGraphBurst(fixtureName, profile);
      const batches = packedGraphFixtureBatches(fixtureName);
      expect(burst.deliveries.map((delivery) => delivery.batch)).toEqual(batches);
      expect(burst.profile).toBe(profile);
      const times = burst.deliveries.map((delivery) => delivery.deliveredAtMs);
      expect(times).toEqual([...times].sort((left, right) => left - right));
    },
  );

  it("lands a storm inside a single frame", () => {
    const burst = packedGraphBurst(fixtureName, "storm");
    expect(burst.deliveries.length).toBeGreaterThan(5);
    for (const delivery of burst.deliveries) {
      expect(delivery.deliveredAtMs).toBeLessThan(packedGraphFrameBudgetMs);
    }
    expect(coalesceDeliveriesByFrame(burst.deliveries)).toHaveLength(1);
  });

  it("spreads a steady stream across frames", () => {
    const burst = packedGraphBurst(fixtureName, "steady");
    expect(coalesceDeliveriesByFrame(burst.deliveries)).toHaveLength(burst.deliveries.length);
  });

  it("replays a catch-up backlog as one frame after the gap", () => {
    const burst = packedGraphBurst(fixtureName, "replay-catch-up");
    const frames = coalesceDeliveriesByFrame(burst.deliveries);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.nodes).toHaveLength(1);
    expect(frames[1]?.nodes.length).toBeGreaterThan(1);
  });
});

describe("packed graph batch coalescing", () => {
  it("reaches the same columns as applying the batches one at a time", () => {
    const burst = packedGraphBurst(fixtureName, "storm");
    const incremental = buildPackedGraphSnapshot(
      burst.workstreamId,
      burst.deliveries.map((delivery) => delivery.batch),
    );
    const coalesced = buildPackedGraphSnapshot(
      burst.workstreamId,
      coalesceDeliveriesByFrame(burst.deliveries),
    );
    expect(columnDigest(coalesced)).toBe(columnDigest(incremental));
  });

  it("keeps the last record of a turn updated twice in one frame", () => {
    const batches = packedGraphFixtureBatches(fixtureName);
    const merged = coalescePackedGraphBatches(batches);
    const lastBatch = batches[batches.length - 1];
    expect(merged.turns).toHaveLength(1);
    expect(merged.turns[0]).toEqual(lastBatch?.turns[0]);
    expect(merged.cursorSequence).toBe(lastBatch?.cursorSequence);
  });

  it("refuses to coalesce nothing", () => {
    expect(() => coalescePackedGraphBatches([])).toThrow("empty batch group");
  });
});

describe("packed graph cursor replay", () => {
  it("resumes from every cursor boundary onto the same columns", () => {
    const burst = packedGraphBurst(fixtureName, "steady");
    const complete = buildPackedGraphSnapshot(
      burst.workstreamId,
      burst.deliveries.map((delivery) => delivery.batch),
    );
    const expected = columnDigest(complete);
    for (const delivery of burst.deliveries) {
      const resumed = resumePackedGraphBurst(burst, delivery.batch.cursorSequence);
      expect(columnDigest(resumed)).toBe(expected);
    }
  });

  it("holds a prefix of the columns at an intermediate cursor", () => {
    const burst = packedGraphBurst(fixtureName, "steady");
    const third = burst.deliveries[2];
    expect(third).toBeDefined();
    const cursor = third?.batch.cursorSequence ?? 0;
    const held = packedGraphSnapshotAtCursor(burst, cursor);
    const complete = buildPackedGraphSnapshot(
      burst.workstreamId,
      burst.deliveries.map((delivery) => delivery.batch),
    );
    expect(held.nodeCount).toBeLessThan(complete.nodeCount);
    expect(held.nodes.ids).toEqual(complete.nodes.ids.slice(0, held.nodeCount));
    expect(packedGraphBatchesAfter(burst, cursor)).toHaveLength(burst.deliveries.length - 3);
  });

  it("applies a coalesced backlog onto a held snapshot", () => {
    const burst = packedGraphBurst(fixtureName, "replay-catch-up");
    const first = burst.deliveries[0];
    const cursor = first?.batch.cursorSequence ?? 0;
    const held = packedGraphSnapshotAtCursor(burst, cursor);
    const backlog = coalescePackedGraphBatches(packedGraphBatchesAfter(burst, cursor));
    const resumed = extendPackedGraphSnapshot(held, backlog);
    const complete = buildPackedGraphSnapshot(
      burst.workstreamId,
      burst.deliveries.map((delivery) => delivery.batch),
    );
    expect(columnDigest(resumed)).toBe(columnDigest(complete));
  });

  it("starts from an empty snapshot before the first cursor", () => {
    const burst = packedGraphBurst(fixtureName, "steady");
    const held = packedGraphSnapshotAtCursor(burst, 0);
    expect(columnDigest(held)).toBe(columnDigest(emptyPackedGraphSnapshot(burst.workstreamId)));
  });
});
