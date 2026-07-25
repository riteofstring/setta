import { describe, expect, it } from "vitest";

import { GraphLadderLayout } from "./graph-ladder-layout";
import {
  GraphScenePacker,
  graphEdgeStaticStride,
  graphNodeStateStride,
  graphNodeStateTextureWidth,
  graphNodeStaticStride,
  graphVisibleEdgeRange,
  graphVisibleNodeRange,
  nodeStateTextureRows,
  stateTexelCapacity,
} from "./graph-scene-packer";
import { packedGraphFixture, packedGraphFixtureBatches } from "../packed-graph-fixtures";
import {
  buildPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphSnapshot,
} from "../packed-graph-snapshot";
import { packedValueAt } from "../packed-graph-vocabulary";

const noPins = new Map<number, boolean>();

function layoutFor(snapshot: PackedGraphSnapshot, layout = new GraphLadderLayout()) {
  return layout.advance(snapshot, {
    timeSeconds: 0,
    deltaSeconds: 1 / 120,
    pinnedTurns: noPins,
    reducedMotion: false,
  });
}

function packFrom(snapshot: PackedGraphSnapshot) {
  const packer = new GraphScenePacker();
  packer.noteChanged(0, 0);
  const ladder = layoutFor(snapshot);
  return packer.sync(snapshot, ladder, { from: ladder.dirtyFrom, to: ladder.dirtyTo });
}

describe("graph scene packer", () => {
  it("writes the static node columns straight from the snapshot", () => {
    const snapshot = packedGraphFixture("branch-merge-and-dead-end");
    const scene = packFrom(snapshot);
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      const offset = index * graphNodeStaticStride;
      expect(packedValueAt(scene.nodeStatic, offset)).toBe(
        packedValueAt(snapshot.nodes.lane, index),
      );
      expect(packedValueAt(scene.nodeStatic, offset + 1)).toBe(
        packedValueAt(snapshot.nodes.bornAt, index),
      );
      expect(packedValueAt(scene.nodeStatic, offset + 4)).toBe(
        packedValueAt(snapshot.nodes.mode, index),
      );
      expect(packedValueAt(scene.nodeStatic, offset + 5)).toBe(
        packedValueAt(snapshot.nodes.glyph, index),
      );
    }
  });

  it("gives an edge its child's terminal time so the beam degrades with it", () => {
    const snapshot = packedGraphFixture("branch-merge-and-dead-end");
    const scene = packFrom(snapshot);
    let terminated = 0;
    for (let index = 0; index < snapshot.edgeCount; index += 1) {
      const offset = index * graphEdgeStaticStride;
      const child = packedValueAt(snapshot.edges.to, index);
      const expected = packedValueAt(snapshot.nodes.terminalAt, child);
      expect(packedValueAt(scene.edgeStatic, offset + 5)).toBe(expected);
      if (Number.isFinite(expected)) {
        terminated += 1;
      }
    }
    expect(terminated).toBeGreaterThan(0);
  });

  it("uploads only the appended range when a batch arrives", () => {
    const batches = packedGraphFixtureBatches("director-and-worker-interleaved");
    const head = batches.slice(0, batches.length - 1);
    const tail = batches[batches.length - 1];
    expect(tail).toBeDefined();
    if (tail === undefined) {
      return;
    }
    const before = buildPackedGraphSnapshot("fixture-director-and-worker", head);
    const packer = new GraphScenePacker();
    packer.noteChanged(0, 0);
    const layout = new GraphLadderLayout();
    const firstLadder = layoutFor(before, layout);
    packer.sync(before, firstLadder, { from: firstLadder.dirtyFrom, to: firstLadder.dirtyTo });

    const after = extendPackedGraphSnapshot(before, tail);
    packer.noteChanged(after.changed.nodesFrom, after.changed.edgesFrom);
    const ladder = layout.advance(after, {
      timeSeconds: 0,
      deltaSeconds: 1 / 120,
      pinnedTurns: noPins,
      reducedMotion: false,
    });
    const scene = packer.sync(after, ladder, { from: ladder.dirtyFrom, to: ladder.dirtyTo });
    expect(scene.nodeStaticUpload.from).toBe(after.changed.nodesFrom);
    expect(scene.nodeStaticUpload.to).toBe(after.nodeCount);
    expect(scene.edgeStaticUpload.from).toBe(after.changed.edgesFrom);
    expect(scene.nodeStaticUpload.to - scene.nodeStaticUpload.from).toBeLessThan(after.nodeCount);
  });

  it("re-uploads a parent whose settle time the new child collapsed", () => {
    const batches = packedGraphFixtureBatches("single-active-turn");
    const before = buildPackedGraphSnapshot("fixture-single-active-turn", batches.slice(0, 2));
    const next = batches[2];
    expect(next).toBeDefined();
    if (next === undefined) {
      return;
    }
    const after = extendPackedGraphSnapshot(before, next);
    // The new child collapses its parent's settle time, so the changed range
    // reaches behind the appended node.
    expect(after.changed.nodesFrom).toBeLessThan(before.nodeCount);
    const packer = new GraphScenePacker();
    packer.noteChanged(0, 0);
    const layout = new GraphLadderLayout();
    const first = layoutFor(before, layout);
    packer.sync(before, first, { from: first.dirtyFrom, to: first.dirtyTo });
    packer.noteChanged(after.changed.nodesFrom, after.changed.edgesFrom);
    const ladder = layout.advance(after, {
      timeSeconds: 0,
      deltaSeconds: 1 / 120,
      pinnedTurns: noPins,
      reducedMotion: false,
    });
    const scene = packer.sync(after, ladder, { from: ladder.dirtyFrom, to: ladder.dirtyTo });
    expect(scene.nodeStaticUpload.from).toBe(after.changed.nodesFrom);
    const parent = after.changed.nodesFrom;
    expect(packedValueAt(scene.nodeStatic, parent * graphNodeStaticStride + 2)).toBe(
      packedValueAt(after.nodes.settleAt, parent),
    );
  });

  it("mirrors the layout into the node state texels", () => {
    const snapshot = packedGraphFixture("approval-and-artifact-arrival");
    const packer = new GraphScenePacker();
    packer.noteChanged(0, 0);
    const ladder = layoutFor(snapshot);
    const scene = packer.sync(snapshot, ladder, { from: ladder.dirtyFrom, to: ladder.dirtyTo });
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      expect(packedValueAt(scene.nodeState, index * graphNodeStateStride)).toBe(
        packedValueAt(ladder.worldY, index),
      );
      expect(packedValueAt(scene.nodeState, index * graphNodeStateStride + 1)).toBe(
        packedValueAt(ladder.open, index),
      );
    }
  });

  it("rebuilds from scratch when the workstream changes", () => {
    const packer = new GraphScenePacker();
    packer.noteChanged(0, 0);
    const first = packedGraphFixture("single-active-turn");
    const firstLadder = layoutFor(first);
    packer.sync(first, firstLadder, { from: firstLadder.dirtyFrom, to: firstLadder.dirtyTo });
    const second = packedGraphFixture("failure-recovery-and-cancellation");
    const secondLadder = layoutFor(second);
    const scene = packer.sync(second, secondLadder, {
      from: secondLadder.dirtyFrom,
      to: secondLadder.dirtyTo,
    });
    expect(scene.reallocated).toBe(true);
    expect(scene.nodeStaticUpload.from).toBe(0);
    expect(scene.nodeStateUpload.to).toBe(second.nodeCount);
  });

  it("rejects an edge stream that targets an earlier node than the one before it", () => {
    const snapshot = packedGraphFixture("branch-merge-and-dead-end");
    const scrambled: PackedGraphSnapshot = {
      ...snapshot,
      edges: { ...snapshot.edges, to: Uint32Array.from(snapshot.edges.to) },
    };
    scrambled.edges.to[1] = 0;
    const packer = new GraphScenePacker();
    packer.noteChanged(0, 0);
    const ladder = layoutFor(scrambled);
    expect(() =>
      packer.sync(scrambled, ladder, { from: ladder.dirtyFrom, to: ladder.dirtyTo }),
    ).toThrow(/targets node/u);
  });
});

describe("graph state texture layout", () => {
  it("rounds the texel capacity up to whole rows", () => {
    expect(stateTexelCapacity(1) % graphNodeStateTextureWidth).toBe(0);
    expect(stateTexelCapacity(graphNodeStateTextureWidth + 1)).toBe(graphNodeStateTextureWidth * 2);
  });

  it("maps a node range onto the rows that hold it", () => {
    expect(nodeStateTextureRows({ from: 0, to: 0 })).toEqual({ firstRow: 0, rowCount: 0 });
    expect(nodeStateTextureRows({ from: 0, to: 1 })).toEqual({ firstRow: 0, rowCount: 1 });
    expect(
      nodeStateTextureRows({
        from: graphNodeStateTextureWidth,
        to: graphNodeStateTextureWidth + 2,
      }),
    ).toEqual({ firstRow: 1, rowCount: 1 });
    expect(
      nodeStateTextureRows({
        from: graphNodeStateTextureWidth - 1,
        to: graphNodeStateTextureWidth + 1,
      }),
    ).toEqual({ firstRow: 0, rowCount: 2 });
  });
});

describe("graph visible slices", () => {
  it("draws only the nodes near the camera", () => {
    const worldY = Float32Array.from([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    const range = graphVisibleNodeRange(worldY, worldY.length, 2, 0.6);
    expect(range.from).toBe(3);
    expect(range.to).toBeGreaterThanOrEqual(6);
    expect(range.to).toBeLessThanOrEqual(worldY.length);
  });

  it("keeps the whole graph when it fits inside the window", () => {
    const worldY = Float32Array.from([0, 0.2, 0.4]);
    const range = graphVisibleNodeRange(worldY, worldY.length, 0.2, 4);
    expect(range).toEqual({ from: 0, to: 3 });
  });

  it("slices the edges whose child lands in the visible node range", () => {
    const edgeTo = Uint32Array.from([1, 2, 3, 4, 5]);
    expect(graphVisibleEdgeRange(edgeTo, edgeTo.length, { from: 3, to: 5 })).toEqual({
      from: 2,
      to: 4,
    });
  });
});
