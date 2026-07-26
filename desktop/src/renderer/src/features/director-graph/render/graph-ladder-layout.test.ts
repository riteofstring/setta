import { describe, expect, it } from "vitest";

import { GraphLadderLayout, advanceGraphCamera } from "./graph-ladder-layout";
import { graphLadderSpacing } from "./graph-visual-language";
import { packedGraphFixture, packedGraphFixtureBatches } from "../packed-graph-fixtures";
import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  type PackedGraphSnapshot,
} from "../packed-graph-snapshot";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";

const noPins = new Map<number, boolean>();

function advance(
  layout: GraphLadderLayout,
  snapshot: PackedGraphSnapshot,
  timeSeconds: number,
  deltaSeconds = 1 / 120,
  pinnedTurns: ReadonlyMap<number, boolean> = noPins,
) {
  return layout.advance(snapshot, {
    timeSeconds,
    deltaSeconds,
    pinnedTurns,
    reducedMotion: false,
  });
}

/** Runs the fold animation to completion so the assertion is on the settled state. */
function settle(
  layout: GraphLadderLayout,
  snapshot: PackedGraphSnapshot,
  timeSeconds: number,
  pinnedTurns: ReadonlyMap<number, boolean> = noPins,
) {
  let frame = advance(layout, snapshot, timeSeconds, 1 / 120, pinnedTurns);
  for (let step = 0; step < 400 && frame.foldAnimating; step += 1) {
    frame = advance(layout, snapshot, timeSeconds, 1 / 60, pinnedTurns);
  }
  return frame;
}

function nodesOfTurn(snapshot: PackedGraphSnapshot, turn: number): number[] {
  const indices: number[] = [];
  for (let index = 0; index < snapshot.nodeCount; index += 1) {
    if (packedValueAt(snapshot.nodes.turn, index) === turn) {
      indices.push(index);
    }
  }
  return indices;
}

describe("graph ladder layout", () => {
  it("spreads an open turn down the spine one row at a time", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    const layout = new GraphLadderLayout();
    const frame = advance(layout, snapshot, 0);
    for (const index of nodesOfTurn(snapshot, 0)) {
      const row = packedValueAt(snapshot.nodes.row, index);
      const role = packedValueAt(snapshot.nodes.role, index);
      const expected =
        row * graphLadderSpacing.rowStep +
        (role === packedGraphRoleCode.outcome ? graphLadderSpacing.outcomeGap : 0);
      expect(packedValueAt(frame.worldY, index)).toBeCloseTo(expected, 6);
      expect(packedValueAt(frame.open, index)).toBeCloseTo(1, 6);
    }
  });

  it("collapses an answered turn onto its outcome node", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const layout = new GraphLadderLayout();
    const compactAt = packedValueAt(snapshot.turns.compactAt, 0);
    const frame = settle(layout, snapshot, compactAt + 1);
    const outcome = packedValueAt(snapshot.turns.outcomeNode, 0);
    const input = packedValueAt(snapshot.turns.inputNode, 0);
    expect(packedValueAt(frame.worldY, outcome)).toBeCloseTo(packedValueAt(frame.worldY, input), 5);
    expect(packedValueAt(frame.open, outcome)).toBe(1);
    expect(packedValueAt(frame.open, input)).toBe(0);
  });

  it("keeps a folded turn tighter than an open one", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const open = settle(new GraphLadderLayout(), snapshot, 0);
    const foldedLayout = new GraphLadderLayout();
    const folded = settle(foldedLayout, snapshot, packedValueAt(snapshot.turns.compactAt, 1) + 1);
    const secondInput = packedValueAt(snapshot.turns.inputNode, 1);
    expect(packedValueAt(folded.worldY, secondInput)).toBeLessThan(
      packedValueAt(open.worldY, secondInput),
    );
  });

  it("honours a manual pin over the automatic fold", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const layout = new GraphLadderLayout();
    const compactAt = packedValueAt(snapshot.turns.compactAt, 0);
    const pinned = settle(layout, snapshot, compactAt + 1, new Map([[0, true]]));
    const outcome = packedValueAt(snapshot.turns.outcomeNode, 0);
    const input = packedValueAt(snapshot.turns.inputNode, 0);
    expect(packedValueAt(pinned.worldY, outcome)).toBeGreaterThan(
      packedValueAt(pinned.worldY, input),
    );
  });

  it("reports a dirty range bounded by the turn that moved", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const layout = new GraphLadderLayout();
    // Settle with the first turn already folded, so the second fold is the only
    // thing that moves.
    settle(layout, snapshot, packedValueAt(snapshot.turns.compactAt, 0) + 1);
    const quiet = advance(layout, snapshot, packedValueAt(snapshot.turns.compactAt, 0) + 1);
    expect(quiet.dirtyFrom).toBe(snapshot.nodeCount);
    const secondTurnFirstNode = nodesOfTurn(snapshot, 1)[0];
    expect(secondTurnFirstNode).toBeDefined();
    const folding = advance(layout, snapshot, packedValueAt(snapshot.turns.compactAt, 1) + 1);
    expect(folding.dirtyFrom).toBe(secondTurnFirstNode);
    expect(folding.dirtyTo).toBe(snapshot.nodeCount);
  });

  it("keeps an append inside its own turn's range", () => {
    const batches = packedGraphFixtureBatches("director-and-worker-interleaved");
    const before = buildPackedGraphSnapshot(
      "fixture-director-and-worker",
      batches.slice(0, batches.length - 1),
    );
    const layout = new GraphLadderLayout();
    settle(layout, before, 0);
    const after = buildPackedGraphSnapshot("fixture-director-and-worker", batches);
    const appendedTurn = packedValueAt(after.nodes.turn, before.nodeCount);
    const frame = advance(layout, after, 0);
    expect(frame.dirtyFrom).toBe(nodesOfTurn(after, appendedTurn)[0]);
    expect(frame.dirtyTo).toBe(after.nodeCount);
    expect(frame.dirtyFrom).toBeGreaterThan(0);
  });

  it("reaches the same positions from a cold build as from an incremental one", () => {
    const batches = packedGraphFixtureBatches("branch-merge-and-dead-end");
    const incremental = new GraphLadderLayout();
    let snapshot = buildPackedGraphSnapshot("fixture-branch-merge", []);
    for (let index = 0; index < batches.length; index += 1) {
      snapshot = buildPackedGraphSnapshot("fixture-branch-merge", batches.slice(0, index + 1));
      advance(incremental, snapshot, 0);
    }
    const incrementalFrame = advance(incremental, snapshot, 0);
    const cold = advance(new GraphLadderLayout(), snapshot, 0);
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      expect(packedValueAt(incrementalFrame.worldY, index)).toBeCloseTo(
        packedValueAt(cold.worldY, index),
        6,
      );
    }
  });

  it("tracks the live edge to the newest committed fact", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    const layout = new GraphLadderLayout();
    const early = advance(layout, snapshot, packedValueAt(snapshot.nodes.bornAt, 0));
    const later = advance(layout, snapshot, 1e6);
    expect(later.liveEdgeWorldY).toBeGreaterThan(early.liveEdgeWorldY);
    expect(later.liveEdgeWorldY).toBe(layout.liveEdge());
  });

  it("goes quiet once the recent window has settled", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    const layout = new GraphLadderLayout();
    const frame = advance(layout, snapshot, 1e6);
    expect(frame.quietUntilSeconds).toBeLessThanOrEqual(1e6);
    expect(frame.foldAnimating).toBe(false);
  });

  it("snaps folds instead of easing them under reduced motion", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const layout = new GraphLadderLayout();
    const compactAt = packedValueAt(snapshot.turns.compactAt, 0);
    const frame = layout.advance(snapshot, {
      timeSeconds: compactAt + 1,
      deltaSeconds: 1 / 120,
      pinnedTurns: noPins,
      reducedMotion: true,
    });
    expect(frame.foldAnimating).toBe(true);
    expect(layout.turnOpenness(0)).toBe(0);
  });

  it("does not keep an autonomous animation tail under reduced motion", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    const timeSeconds = packedValueAt(snapshot.nodes.bornAt, 0);
    const frame = new GraphLadderLayout().advance(snapshot, {
      timeSeconds,
      deltaSeconds: 1 / 120,
      pinnedTurns: noPins,
      reducedMotion: true,
    });
    expect(frame.quietUntilSeconds).toBe(timeSeconds);
  });

  it("applies a terminal fold immediately under reduced motion", () => {
    const snapshot = packedGraphFixture("approval-and-artifact-arrival");
    const answerAt = packedValueAt(snapshot.turns.answerAt, 0);
    const layout = new GraphLadderLayout();
    layout.advance(snapshot, {
      timeSeconds: answerAt,
      deltaSeconds: 0,
      pinnedTurns: noPins,
      reducedMotion: true,
    });
    expect(layout.turnOpenness(0)).toBe(0);
  });

  it("rejects a snapshot whose turns are not contiguous", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    const scrambled: PackedGraphSnapshot = {
      ...snapshot,
      nodes: { ...snapshot.nodes, turn: Uint16Array.from(snapshot.nodes.turn).fill(0, 1, 2) },
    };
    scrambled.nodes.turn[0] = 0;
    scrambled.nodes.turn[1] = 1;
    scrambled.nodes.turn[2] = 0;
    expect(() => advance(new GraphLadderLayout(), scrambled, 0)).toThrow(/not contiguous/u);
  });

  it("lays the same workstream out again after a replacement", () => {
    // A resync, a cold replay, or a restarted stream hands the same workstream
    // a snapshot that starts over. The turn ranges describe the snapshot they
    // were built from, so carrying them into a replacement makes the first
    // rebuilt row look like a discontiguous turn.
    const batches = packedGraphFixtureBatches("branch-merge-and-dead-end");
    const full = buildPackedGraphSnapshot("ws-replaced", batches);
    const empty = emptyPackedGraphSnapshot("ws-replaced");
    const stale = new GraphLadderLayout();
    settle(stale, full, 60);
    advance(stale, empty, 0);
    expect(() => advance(stale, full, 0)).toThrow(/not contiguous/u);

    const replaced = new GraphLadderLayout();
    settle(replaced, full, 60);
    replaced.reset();
    advance(replaced, empty, 0);
    const healed = settle(replaced, full, 60);
    const cold = settle(new GraphLadderLayout(), full, 60);
    expect(Array.from(healed.worldY.subarray(0, full.nodeCount))).toStrictEqual(
      Array.from(cold.worldY.subarray(0, full.nodeCount)),
    );
    expect(healed.liveEdgeWorldY).toBe(cold.liveEdgeWorldY);
  });
});

describe("graph camera", () => {
  it("eases onto the live edge and snaps once it arrives", () => {
    const first = advanceGraphCamera(0, 1, 1 / 120, false);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    let camera = first;
    for (let step = 0; step < 600; step += 1) {
      camera = advanceGraphCamera(camera, 1, 1 / 120, false);
    }
    expect(camera).toBe(1);
  });

  it("jumps straight to the target under reduced motion", () => {
    expect(advanceGraphCamera(0, 3, 1 / 120, true)).toBe(3);
  });
});
