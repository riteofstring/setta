import type { SemanticNode, WorkstreamGraph } from "@generated/backend";
import {
  evidenceClassValues,
  semanticEdgeKindValues,
  semanticNodeKindValues,
  semanticNodeStatusValues,
} from "@generated/backend";
import { describe, expect, it } from "vitest";

import { projectionGalleryFixtures } from "./projection-gallery-fixtures";
import type { PackedGraphSnapshot } from "./packed-graph-snapshot";
import {
  packSemanticGraphComposition,
  type SemanticGraphPresentation,
} from "./semantic-graph-packer";
import {
  packedGraphEdgeChannelCode,
  packedGraphModeCode,
  packedGraphNever,
  packedValueAt,
} from "./packed-graph-vocabulary";

function nodeCountsByTurn(snapshot: PackedGraphSnapshot): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (let index = 0; index < snapshot.nodeCount; index += 1) {
    const turn = packedValueAt(snapshot.nodes.turn, index);
    counts.set(turn, (counts.get(turn) ?? 0) + 1);
  }
  return counts;
}

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

function concurrentFanGraph(): WorkstreamGraph {
  const workstreamId = "workstream:parallel";
  const node = (
    id: string,
    kind: SemanticNode["kind"],
    createdAt: string,
    completedAt: string,
  ): SemanticNode => ({
    actor: "worker",
    artifactIds: [],
    completedAt,
    createdAt,
    evidenceClass: "runtime_fact",
    id,
    interpretation: null,
    kind,
    publicSummary: id,
    runId: "run-parallel",
    sourceEventIds: [`event:${id}`],
    status: "succeeded",
    updatedAt: completedAt,
    workstreamId,
  });
  const nodes = [
    node("fork", "action", "2026-07-25T17:00:01Z", "2026-07-25T17:00:01Z"),
    node("terminal", "action", "2026-07-25T17:00:02Z", "2026-07-25T17:00:05Z"),
    node("reader", "investigation", "2026-07-25T17:00:03Z", "2026-07-25T17:00:04Z"),
    node("merge", "completed", "2026-07-25T17:00:06Z", "2026-07-25T17:00:06Z"),
  ];
  const edge = (
    id: string,
    fromNodeId: string,
    toNodeId: string,
    createdAt: string,
  ): WorkstreamGraph["edges"][number] => ({
    createdAt,
    fromNodeId,
    id,
    kind: "followed_by",
    sourceEventIds: [`event:${id}`],
    toNodeId,
    workstreamId,
  });
  return {
    detailLevel: "selected",
    edges: [
      edge("fork-terminal", "fork", "terminal", "2026-07-25T17:00:02Z"),
      edge("fork-reader", "fork", "reader", "2026-07-25T17:00:03Z"),
      edge("terminal-merge", "terminal", "merge", "2026-07-25T17:00:06Z"),
      edge("reader-merge", "reader", "merge", "2026-07-25T17:00:06Z"),
    ],
    hasEarlier: false,
    nodes,
    workstreamId,
  };
}

function failedOutcomeGraph(workstreamId: string): WorkstreamGraph {
  const node = (
    id: string,
    kind: SemanticNode["kind"],
    status: SemanticNode["status"],
    second: number,
  ): SemanticNode => {
    const at = `2026-07-25T17:00:0${second}Z`;
    return {
      actor: kind === "user_goal" ? "user" : "worker",
      artifactIds: [],
      completedAt: at,
      createdAt: at,
      evidenceClass: "runtime_fact",
      id,
      interpretation: null,
      kind,
      publicSummary: id,
      runId: "run-failed",
      sourceEventIds: [`event:${id}`],
      status,
      updatedAt: at,
      workstreamId,
    };
  };
  const edge = (
    id: string,
    fromNodeId: string,
    toNodeId: string,
    second: number,
  ): WorkstreamGraph["edges"][number] => ({
    createdAt: `2026-07-25T17:00:0${second}Z`,
    fromNodeId,
    id,
    kind: "followed_by",
    sourceEventIds: [`event:${id}`],
    toNodeId,
    workstreamId,
  });
  return {
    detailLevel: "selected",
    edges: [
      edge("input-step", "input", "failed-step", 2),
      edge("step-outcome", "failed-step", "failed-outcome", 3),
    ],
    hasEarlier: false,
    nodes: [
      node("input", "user_goal", "failed", 1),
      node("failed-step", "action", "failed", 2),
      node("failed-outcome", "failed", "failed", 3),
    ],
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
      presentation: "conversation",
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
   * Past a handful of conversations the view becomes a grid. The Director keeps
   * its centre spine, every worker still gets a flanking cell, and the cells
   * occupy more than one row instead of becoming one row of slivers.
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

  it("keeps Director row geometry unchanged when a grid viewport resizes", () => {
    const fixture = projectionGalleryFixtures.find((candidate) =>
      candidate.graphs.some((graph) => graph.nodes.length > 3),
    );
    expect(fixture).toBeDefined();
    const director = fixture?.graphs.find((graph) => graph.nodes.length > 3);
    expect(director).toBeDefined();
    if (director === undefined) {
      return;
    }
    const graphs = [
      director,
      ...Array.from({ length: 8 }, (_unused, index) =>
        renameGraph(director, `invariant-grid-${index}`),
      ),
    ];
    const packAt = (width: number, height: number) =>
      packSemanticGraphComposition({
        graphs,
        presentation: "grid",
        viewport: { height, width },
        workstreamId: "invariant-grid",
      });
    const directorRows = (snapshot: ReturnType<typeof packSemanticGraphComposition>) =>
      Array.from({ length: snapshot.nodeCount }, (_unused, index) => index)
        .filter((index) => packedValueAt(snapshot.nodes.turn, index) === 0)
        .map((index) => packedValueAt(snapshot.nodes.row, index));

    const compact = packAt(800, 700);
    const expansive = packAt(2000, 1400);

    expect(directorRows(expansive)).toEqual(directorRows(compact));
    expect(packedValueAt(expansive.turns.rowSpan, 0)).toBe(packedValueAt(compact.turns.rowSpan, 0));
  });

  /*
   * Finished work folds only while reading one conversation. Director overview
   * level of detail is decided while packing, so short trails do not
   * independently fold after arrival.
   */
  it("sets a fold clock only for a conversation", () => {
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

  it("keeps complete columns, short grid trails through six workers, and one activity node beyond", () => {
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
    const expandedGraphs = [
      long,
      ...Array.from({ length: 6 }, (_u, i) => renameGraph(long, `expanded-tile-${i}`)),
    ];
    const expanded = packSemanticGraphComposition({
      graphs: expandedGraphs,
      presentation: "grid",
      workstreamId: "expanded-grid",
    });

    const expandedPerTurn = nodeCountsByTurn(expanded);
    expect(expandedPerTurn.get(0)).toBe(long.nodes.length);
    for (const [turn, count] of expandedPerTurn) {
      if (turn === 0) {
        continue;
      }
      expect(count).toBeLessThanOrEqual(3);
    }

    const columns = packSemanticGraphComposition({
      graphs: expandedGraphs.slice(0, 5),
      presentation: "columns",
      workstreamId: "expanded-columns",
    });
    const columnsPerTurn = nodeCountsByTurn(columns);
    expect(columnsPerTurn.get(0)).toBe(long.nodes.length);
    for (const [turn, count] of columnsPerTurn) {
      if (turn !== 0) {
        expect(count).toBe(long.nodes.length);
      }
    }

    const activityGraphs = [
      long,
      ...Array.from({ length: 7 }, (_u, i) => renameGraph(long, `activity-tile-${i}`)),
    ];
    const activity = packSemanticGraphComposition({
      graphs: activityGraphs,
      presentation: "grid",
      workstreamId: "activity-grid",
    });
    expect(activity.nodeCount).toBe(long.nodes.length + activityGraphs.length - 1);
    expect(activity.edgeCount).toBe(long.edges.length);
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

  it("keeps a linear delegation on one spine", () => {
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

    const channels = Array.from({ length: snapshot.edgeCount }, (_unused, index) =>
      packedValueAt(snapshot.edges.channel, index),
    );
    expect(new Set(channels)).toEqual(new Set([packedGraphEdgeChannelCode.flow]));
    const lanes = Array.from({ length: snapshot.nodeCount }, (_unused, index) =>
      packedValueAt(snapshot.nodes.lane, index),
    );
    expect(new Set(lanes).size).toBe(1);
  });

  it("spreads only overlapping siblings and brings their edges back to the merge", () => {
    const snapshot = packSemanticGraphComposition({
      presentation: "columns",
      workstreamId: "parallel",
      graphs: [concurrentFanGraph()],
    });
    const laneByID = new Map(
      snapshot.nodes.ids.map((id, index) => [id, packedValueAt(snapshot.nodes.lane, index)]),
    );
    expect(laneByID.get("workstream:parallel:fork")).toBe(0);
    expect(laneByID.get("workstream:parallel:terminal")).toBeLessThan(0);
    expect(laneByID.get("workstream:parallel:reader")).toBeGreaterThan(0);
    expect(laneByID.get("workstream:parallel:merge")).toBe(0);

    const channels = Array.from({ length: snapshot.edgeCount }, (_unused, index) =>
      packedValueAt(snapshot.edges.channel, index),
    );
    expect(
      channels.filter((channel) => channel === packedGraphEdgeChannelCode.branch),
    ).toHaveLength(2);
    expect(channels.filter((channel) => channel === packedGraphEdgeChannelCode.merge)).toHaveLength(
      2,
    );
  });

  it("animates failed reasoning facts but keeps failed inputs and outcomes full", () => {
    const graph = failedOutcomeGraph("workstream:failed");
    const snapshot = packSemanticGraphComposition({
      presentation: "columns",
      workstreamId: graph.workstreamId,
      graphs: [graph],
    });
    const input = snapshot.nodeIndexById.get("workstream:failed:input");
    const step = snapshot.nodeIndexById.get("workstream:failed:failed-step");
    const outcome = snapshot.nodeIndexById.get("workstream:failed:failed-outcome");
    expect(input).toBeDefined();
    expect(step).toBeDefined();
    expect(outcome).toBeDefined();
    if (input === undefined || step === undefined || outcome === undefined) {
      return;
    }

    expect(packedValueAt(snapshot.nodes.mode, input)).toBe(packedGraphModeCode.fail);
    expect(packedValueAt(snapshot.nodes.terminal, input)).toBe(0);
    expect(packedValueAt(snapshot.nodes.terminalAt, input)).toBe(packedGraphNever);
    expect(packedValueAt(snapshot.nodes.mode, step)).toBe(packedGraphModeCode.fail);
    expect(packedValueAt(snapshot.nodes.terminal, step)).toBe(1);
    expect(packedValueAt(snapshot.nodes.terminalAt, step)).toBeLessThan(packedGraphNever);
    expect(packedValueAt(snapshot.nodes.mode, outcome)).toBe(packedGraphModeCode.fail);
    expect(packedValueAt(snapshot.nodes.terminal, outcome)).toBe(0);
    expect(packedValueAt(snapshot.nodes.terminalAt, outcome)).toBe(packedGraphNever);

    const edgeIntoStep = Array.from({ length: snapshot.edgeCount }, (_unused, index) => index).find(
      (index) => packedValueAt(snapshot.edges.to, index) === step,
    );
    const edgeIntoOutcome = Array.from(
      { length: snapshot.edgeCount },
      (_unused, index) => index,
    ).find((index) => packedValueAt(snapshot.edges.to, index) === outcome);
    expect(edgeIntoStep).toBeDefined();
    expect(edgeIntoOutcome).toBeDefined();
    if (edgeIntoStep === undefined || edgeIntoOutcome === undefined) {
      return;
    }
    expect(packedValueAt(snapshot.edges.terminated, edgeIntoStep)).toBe(1);
    expect(packedValueAt(snapshot.edges.terminated, edgeIntoOutcome)).toBe(0);
  });

  it("keeps a dense-grid failure node in the full fail-mode state", () => {
    const director = failedOutcomeGraph("workstream:director");
    const workers = Array.from({ length: 7 }, (_unused, index) =>
      failedOutcomeGraph(`workstream:worker-${index}`),
    );
    const snapshot = packSemanticGraphComposition({
      presentation: "grid",
      workstreamId: director.workstreamId,
      graphs: [director, ...workers],
    });
    const activity = snapshot.nodeIndexById.get("workstream:worker-0:failed-outcome");
    expect(activity).toBeDefined();
    if (activity === undefined) {
      return;
    }
    expect(packedValueAt(snapshot.nodes.mode, activity)).toBe(packedGraphModeCode.fail);
    expect(packedValueAt(snapshot.nodes.terminal, activity)).toBe(0);
    expect(packedValueAt(snapshot.nodes.terminalAt, activity)).toBe(packedGraphNever);
  });
});
