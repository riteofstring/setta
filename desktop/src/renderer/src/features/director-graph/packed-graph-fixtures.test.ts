import { describe, expect, it } from "vitest";

import {
  compilePackedGraphScene,
  packedGraphFixture,
  packedGraphFixtureBatches,
  packedGraphScaleFixture,
  packedGraphWorkstreamSet,
} from "./packed-graph-fixtures";
import {
  packedGraphFixtureNames,
  packedGraphScene,
  type PackedGraphFixtureName,
} from "./packed-graph-scenes";
import { buildPackedGraphSnapshot } from "./packed-graph-snapshot";
import type { PackedGraphSnapshot } from "./packed-graph-snapshot";
import {
  packedGraphDetails,
  packedGraphEdgeChannels,
  packedGraphEmphases,
  packedGraphGlyphs,
  packedGraphLabelPlacements,
  packedGraphModes,
  packedGraphOutcomes,
  packedGraphRoles,
  packedValueAt,
} from "./packed-graph-vocabulary";

function columnValues(column: ArrayLike<number>, count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => packedValueAt(column, index));
}

function allFixtures(): readonly PackedGraphSnapshot[] {
  return packedGraphFixtureNames.map((name) => packedGraphFixture(name));
}

function usedCodes(select: (snapshot: PackedGraphSnapshot) => readonly number[]): Set<number> {
  const used = new Set<number>();
  for (const snapshot of allFixtures()) {
    for (const code of select(snapshot)) {
      used.add(code);
    }
  }
  return used;
}

describe("packed graph fixtures", () => {
  it.each(packedGraphFixtureNames)("compiles %s", (name) => {
    const snapshot = packedGraphFixture(name);
    expect(snapshot.workstreamId).toBe(packedGraphScene(name).workstreamId);
    expect(snapshot.nodeCount).toBeGreaterThan(0);
    expect(snapshot.edgeCount).toBeGreaterThan(0);
    expect(snapshot.turnCount).toBeGreaterThan(0);
    expect(snapshot.cursorSequence).toBeGreaterThan(0);
  });

  it("produces identical columns for the same scene", () => {
    const name: PackedGraphFixtureName = "branch-merge-and-dead-end";
    const scene = packedGraphScene(name);
    const first = packedGraphFixture(name);
    const second = buildPackedGraphSnapshot(scene.workstreamId, compilePackedGraphScene(scene));
    expect(second.nodes.ids).toEqual(first.nodes.ids);
    expect(columnValues(second.nodes.bornAt, second.nodeCount)).toEqual(
      columnValues(first.nodes.bornAt, first.nodeCount),
    );
    expect(columnValues(second.edges.to, second.edgeCount)).toEqual(
      columnValues(first.edges.to, first.edgeCount),
    );
  });

  it("leaves an unfinished turn running with no outcome node", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    expect(snapshot.turnCount).toBe(1);
    expect(packedValueAt(snapshot.turns.outcomeNode, 0)).toBe(-1);
    expect(packedValueAt(snapshot.turns.answerAt, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("marks the compaction boundary and drops compacted step labels", () => {
    const snapshot = packedGraphFixture("compacted-history-boundary");
    expect(snapshot.hasEarlier).toBe(true);
    const compacted = snapshot.nodes.labels.filter(
      (label, index) => label === "" && packedValueAt(snapshot.nodes.detail, index) === 1,
    );
    expect(compacted.length).toBeGreaterThan(0);
  });

  it("terminates dead ends and never continues from them", () => {
    const snapshot = packedGraphFixture("branch-merge-and-dead-end");
    const terminals = columnValues(snapshot.nodes.terminal, snapshot.nodeCount).flatMap(
      (flag, index) => (flag === 1 ? [index] : []),
    );
    expect(terminals.length).toBeGreaterThan(1);
    const parents = new Set(columnValues(snapshot.edges.from, snapshot.edgeCount));
    for (const terminal of terminals) {
      expect(parents.has(terminal)).toBe(false);
    }
  });

  it("scales with the requested shape", () => {
    const small = packedGraphScaleFixture({
      workstreamId: "scale-small",
      turns: 2,
      stepsPerTurn: 3,
      lanes: 0,
    });
    const large = packedGraphScaleFixture({
      workstreamId: "scale-large",
      turns: 8,
      stepsPerTurn: 3,
      lanes: 3,
    });
    expect(small.nodeCount).toBe(2 * (1 + 3 + 1));
    expect(large.nodeCount).toBeGreaterThan(small.nodeCount * 3);
    expect(large.turnCount).toBe(8);
  });

  it("builds a distinct snapshot per workstream", () => {
    const set = packedGraphWorkstreamSet(100);
    expect(set).toHaveLength(100);
    expect(new Set(set.map((snapshot) => snapshot.workstreamId)).size).toBe(100);
    expect(set.every((snapshot) => snapshot.nodeCount > 0)).toBe(true);
  });

  it("delivers every fixture as an ordered batch stream", () => {
    const batches = packedGraphFixtureBatches("approval-and-artifact-arrival");
    const cursors = batches.map((batch) => batch.cursorSequence);
    expect(cursors).toEqual([...cursors].sort((left, right) => left - right));
    expect(new Set(cursors).size).toBe(cursors.length);
  });
});

describe("packed graph fixture coverage", () => {
  const axes: readonly {
    name: string;
    values: readonly string[];
    used: () => Set<number>;
  }[] = [
    {
      name: "modes",
      values: packedGraphModes,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.nodes.mode, snapshot.nodeCount)]),
    },
    {
      name: "glyphs",
      values: packedGraphGlyphs,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.nodes.glyph, snapshot.nodeCount)]),
    },
    {
      name: "roles",
      values: packedGraphRoles,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.nodes.role, snapshot.nodeCount)]),
    },
    {
      name: "emphases",
      values: packedGraphEmphases,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.nodes.emphasis, snapshot.nodeCount)]),
    },
    {
      name: "details",
      values: packedGraphDetails,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.nodes.detail, snapshot.nodeCount)]),
    },
    {
      name: "label placements",
      values: packedGraphLabelPlacements,
      used: () =>
        usedCodes((snapshot) => [
          ...columnValues(snapshot.nodes.labelPlacement, snapshot.nodeCount),
        ]),
    },
    {
      name: "edge channels",
      values: packedGraphEdgeChannels,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.edges.channel, snapshot.edgeCount)]),
    },
    {
      name: "outcomes",
      values: packedGraphOutcomes,
      used: () =>
        usedCodes((snapshot) => [...columnValues(snapshot.turns.outcome, snapshot.turnCount)]),
    },
  ];

  it.each(axes)("draws every value in $name", ({ values, used }) => {
    const drawn = used();
    const missing = values.filter((_unused, code) => !drawn.has(code));
    expect(missing).toEqual([]);
  });
});
