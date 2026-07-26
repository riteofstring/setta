import type { SemanticNode, WorkstreamGraph } from "@generated/backend";
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

/*
 * A tile whose kept last node points back at one the tile drops.
 *
 * Five nodes, of which a tile keeps the final three. The last is `completed`,
 * which is an outcome kind, and it carries a `blocked_by` edge to the first
 * node — the shape the projector emits when work is held up by something
 * earlier, and the one that made the outcome depend on which edge list was read.
 */
function tileGraphWithEdgeToDroppedNode(workstreamId: string): WorkstreamGraph {
  const nodes = ["action", "action", "action", "action", "completed"].map((kind, index) =>
    tileNode(workstreamId, index + 1, kind as SemanticNode["kind"]),
  );
  return {
    detailLevel: "adjacent",
    edges: [
      {
        createdAt: "2026-07-25T17:05:00Z",
        fromNodeId: "node-5",
        id: "edge-blocked",
        kind: "blocked_by",
        sourceEventIds: ["event-blocked"],
        toNodeId: "node-1",
        workstreamId,
      },
    ],
    hasEarlier: false,
    nodes,
    workstreamId,
  };
}

function tileNode(
  workstreamId: string,
  position: number,
  kind: SemanticNode["kind"],
): SemanticNode {
  const at = `2026-07-25T17:0${position}:00Z`;
  return {
    actor: "worker",
    artifactIds: [],
    completedAt: at,
    createdAt: at,
    evidenceClass: "runtime_fact",
    id: `node-${position}`,
    interpretation: null,
    kind,
    publicSummary: `Step ${position}`,
    runId: "run-tile",
    sourceEventIds: [`event-${position}`],
    status: "succeeded",
    updatedAt: at,
    workstreamId,
  };
}

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
   * Finished work folds itself on every presentation: the reader's reward for
   * a completed run is the single success node, and the trajectory stays one
   * activation away.
   */
  it("sets a fold clock for finished turns on every presentation", () => {
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
    expect(compactClocks("columns").some((clock) => Number.isFinite(clock))).toBe(true);
    expect(compactClocks("grid").some((clock) => Number.isFinite(clock))).toBe(true);
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

  /*
   * A tile is classified by what it shows.
   *
   * The outcome is the last terminal node with nothing after it, so an edge
   * leaving a node disqualifies it. Reading edges from the full graphs while
   * nodes came from the tile meant an edge to a node the tile dropped still
   * counted: the tile's real last fact was disqualified by a relationship it is
   * not displaying, and the classification came from history that is not there.
   *
   * The fixture below is that exact shape — a kept `completed` node with a
   * `blocked_by` edge back to a node the tile drops.
   */
  it("classifies a tile by its own nodes, not by edges it dropped", () => {
    const lead = tileGraphWithEdgeToDroppedNode("workstream:lead");
    const tile = tileGraphWithEdgeToDroppedNode("workstream:tile");
    const snapshot = packSemanticGraphComposition({
      graphs: [lead, tile],
      presentation: "grid",
      workstreamId: "grid",
    });

    // The tile is turn 1; turn 0 is the lead column, which keeps everything.
    const outcome = packedValueAt(snapshot.turns.outcomeNode, 1);
    expect(outcome).toBeGreaterThanOrEqual(0);
    expect(snapshot.nodes.ids[outcome]).toBe("workstream:tile:node-5");

    // The lead column keeps the dropped node, so its own edge still counts and
    // its last fact is not the outcome. That contrast is the whole point: the
    // same graph classifies differently depending on how much of it is shown.
    const leadOutcome = packedValueAt(snapshot.turns.outcomeNode, 0);
    expect(snapshot.nodes.ids[leadOutcome] ?? null).not.toBe("workstream:lead:node-5");
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
