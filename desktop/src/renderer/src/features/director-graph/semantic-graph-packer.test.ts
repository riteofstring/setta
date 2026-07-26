import type { WorkstreamGraph } from "@generated/backend";
import {
  evidenceClassValues,
  semanticEdgeKindValues,
  semanticNodeKindValues,
  semanticNodeStatusValues,
} from "@generated/backend";
import { describe, expect, it } from "vitest";

import { projectionGalleryFixtures } from "./projection-gallery-fixtures";
import {
  packSemanticGraphComposition,
  type SemanticGraphPresentation,
} from "./semantic-graph-packer";
import { packedValueAt } from "./packed-graph-vocabulary";

/** Copies a fixture graph under a new workstream id, so a composition can hold many. */
function renameGraph(graph: WorkstreamGraph | undefined, workstreamId: string): WorkstreamGraph {
  if (graph === undefined) {
    throw new Error("no fixture graph to copy");
  }
  return {
    ...graph,
    workstreamId,
    nodes: graph.nodes.map((node) => ({ ...node, workstreamId })),
    edges: graph.edges.map((edge) => ({ ...edge, workstreamId })),
  };
}

function semanticNodes() {
  return projectionGalleryFixtures.flatMap((fixture) =>
    fixture.graphs.flatMap((graph) => graph.nodes),
  );
}

function semanticEdges() {
  return projectionGalleryFixtures.flatMap((fixture) =>
    fixture.graphs.flatMap((graph) => graph.edges),
  );
}

describe("semantic graph gallery fixtures", () => {
  it("are generated from projected workstream graphs", () => {
    expect(projectionGalleryFixtures.length).toBeGreaterThan(0);
    for (const fixture of projectionGalleryFixtures) {
      expect(fixture.graphs.length).toBeGreaterThan(0);
      expect(fixture.graphs.some((graph) => graph.nodes.length > 0)).toBe(true);
    }
  });

  it("cover every generated semantic node, edge, status, and evidence value", () => {
    const nodeKinds = new Set(semanticNodes().map((node) => node.kind));
    const nodeStatuses = new Set(semanticNodes().map((node) => node.status));
    const evidenceClasses = new Set(semanticNodes().map((node) => node.evidenceClass));
    const edgeKinds = new Set(semanticEdges().map((edge) => edge.kind));

    expect(semanticNodeKindValues.filter((value) => !nodeKinds.has(value))).toEqual([]);
    expect(semanticNodeStatusValues.filter((value) => !nodeStatuses.has(value))).toEqual([]);
    expect(evidenceClassValues.filter((value) => !evidenceClasses.has(value))).toEqual([]);
    expect(semanticEdgeKindValues.filter((value) => !edgeKinds.has(value))).toEqual([]);
  });
});

describe("semantic graph packer", () => {
  it.each(projectionGalleryFixtures)("packs $name into a drawable snapshot", (fixture) => {
    const snapshot = packSemanticGraphComposition({
      presentation: "columns",
      workstreamId: fixture.name,
      graphs: fixture.graphs,
    });
    const semanticNodeCount = fixture.graphs.reduce(
      (count, graph) => count + graph.nodes.length,
      0,
    );
    const semanticEdgeCount = fixture.graphs.reduce(
      (count, graph) => count + graph.edges.length,
      0,
    );

    expect(snapshot.nodeCount).toBe(semanticNodeCount);
    expect(snapshot.edgeCount).toBe(semanticEdgeCount);
    expect(snapshot.turnCount).toBeGreaterThan(0);
    expect(snapshot.cursorSequence).toBe(snapshot.nodeCount + snapshot.edgeCount);
  });

  /*
   * A column per workstream is what makes the Director view readable and
   * foldable. Packing the whole composition as one turn put the second
   * conversation below the end of the first rather than beside its start, and
   * made folding an outcome collapse every conversation at once.
   */
  it("gives each workstream its own column, rows, and turn", () => {
    const fixture = projectionGalleryFixtures.find(
      (candidate) => candidate.graphs.filter((graph) => graph.nodes.length > 0).length > 1,
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const populated = fixture.graphs.filter((graph) => graph.nodes.length > 0);
    const snapshot = packSemanticGraphComposition({
      presentation: "columns",
      workstreamId: fixture.name,
      graphs: fixture.graphs,
    });

    expect(snapshot.turnCount).toBe(populated.length);
    const columns = new Set<number>();
    for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
      columns.add(packedValueAt(snapshot.turns.column, turn));
    }
    expect(columns.size).toBe(snapshot.turnCount);

    // Every column is read from its own beginning, so each one has a row 0 and
    // its rows never continue the column before it.
    const rowsByTurn = new Map<number, number[]>();
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(snapshot.nodes.turn, index);
      const rows = rowsByTurn.get(turn) ?? [];
      rows.push(packedValueAt(snapshot.nodes.row, index));
      rowsByTurn.set(turn, rows);
    }
    expect(rowsByTurn.size).toBe(snapshot.turnCount);
    for (const rows of rowsByTurn.values()) {
      expect(Math.min(...rows)).toBe(0);
    }
  });

  /*
   * Past a handful of conversations the view becomes a grid. Every conversation
   * still gets a cell — none of them stop being drawn because another one
   * started — and the cells occupy more than one row, which is the difference
   * between a grid and a row of slivers.
   */
  it("tiles the conversations into a grid once there are too many for columns", () => {
    const fixture = projectionGalleryFixtures.find((candidate) =>
      candidate.graphs.some((graph) => graph.nodes.length > 0),
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const populated = fixture.graphs.filter((graph) => graph.nodes.length > 0);
    const many = Array.from({ length: 9 }, (_unused, index) =>
      renameGraph(populated[index % populated.length], `workstream-tile-${index}`),
    );
    const snapshot = packSemanticGraphComposition({
      graphs: many,
      presentation: "grid",
      workstreamId: "grid",
    });

    expect(snapshot.turnCount).toBe(many.length);
    const tops = new Set<number>();
    const lanes = new Set<number>();
    for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
      tops.add(packedValueAt(snapshot.turns.columnTop, turn));
      lanes.add(packedValueAt(snapshot.nodes.lane, packedValueAt(snapshot.turns.inputNode, turn)));
    }
    expect(tops.size).toBeGreaterThan(1);
    expect(lanes.size).toBeGreaterThan(1);
  });

  /*
   * Only a conversation folds itself. The Director's views exist to show the
   * work, so nothing on them may collapse to a dot because it finished — that
   * is the view losing the thing it is for.
   */
  it("sets a fold clock for a conversation and for nothing else", () => {
    const fixture = projectionGalleryFixtures.find((candidate) =>
      candidate.graphs.some((graph) => graph.nodes.length > 0),
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const compactClocks = (presentation: SemanticGraphPresentation) => {
      const snapshot = packSemanticGraphComposition({
        graphs: fixture.graphs,
        presentation,
        workstreamId: fixture.name,
      });
      const clocks: number[] = [];
      for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
        clocks.push(packedValueAt(snapshot.turns.compactAt, turn));
      }
      return clocks;
    };

    expect(compactClocks("conversation").some((clock) => Number.isFinite(clock))).toBe(true);
    expect(compactClocks("columns").every((clock) => !Number.isFinite(clock))).toBe(true);
    expect(compactClocks("grid").every((clock) => !Number.isFinite(clock))).toBe(true);
  });

  it("reduces a grid tile to its latest activity", () => {
    const fixture = projectionGalleryFixtures.find(
      (candidate) => candidate.graphs.filter((graph) => graph.nodes.length > 3).length > 0,
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const long = fixture.graphs.find((graph) => graph.nodes.length > 3);
    expect(long).toBeDefined();
    if (long === undefined) {
      return;
    }
    const graphs = [long, ...Array.from({ length: 8 }, (_u, i) => renameGraph(long, `tile-${i}`))];
    const snapshot = packSemanticGraphComposition({
      graphs,
      presentation: "grid",
      workstreamId: "grid",
    });

    // The lead column keeps its trajectory; every tile is cut down to its end.
    const perTurn = new Map<number, number>();
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(snapshot.nodes.turn, index);
      perTurn.set(turn, (perTurn.get(turn) ?? 0) + 1);
    }
    expect(perTurn.get(0)).toBe(long.nodes.length);
    for (const [turn, count] of perTurn) {
      if (turn === 0) {
        continue;
      }
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("draws cross-workstream delegation inside the gallery composition", () => {
    const fixture = projectionGalleryFixtures.find((candidate) => candidate.name === "delegation");
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const snapshot = packSemanticGraphComposition({
      presentation: "columns",
      workstreamId: fixture.name,
      graphs: fixture.graphs,
    });
    const delegatedEdges = fixture.graphs.flatMap((graph) =>
      graph.edges.filter((edge) => edge.kind === "delegated_to"),
    );
    expect(delegatedEdges.length).toBeGreaterThan(0);
    expect(snapshot.edgeCount).toBeGreaterThanOrEqual(delegatedEdges.length);

    const branchEdges = Array.from({ length: snapshot.edgeCount }, (_unused, index) =>
      packedValueAt(snapshot.edges.channel, index),
    ).filter((channel) => channel === 1);
    expect(branchEdges.length).toBeGreaterThan(0);
  });
});
