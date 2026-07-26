/**
 * Packs generated Director semantic graph contracts for the WebGL2 renderer.
 *
 * The projector owns semantic meaning. This file only maps generated contract
 * values to the renderer's packed visual vocabulary and arranges a graph into
 * turn ladders the existing canvas can draw.
 */

import type { SemanticEdge, SemanticNode, WorkstreamGraph } from "@generated/backend";

import {
  semanticEdgeChannels,
  semanticEdgeMode,
  semanticEvidenceEmphases,
  semanticNodeKindVisuals,
  semanticNodeMode,
  semanticStatusOutcomes,
} from "./semantic-graph-visual-catalog";
import {
  buildPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphEdgeInput,
  type PackedGraphNodeInput,
  type PackedGraphSnapshot,
  type PackedGraphTurnInput,
} from "./packed-graph-snapshot";
import type { PackedGraphMode, PackedGraphOutcome } from "./packed-graph-vocabulary";

/*
 * What the canvas is being asked to show.
 *
 * The three are genuinely different presentations, not one with settings: they
 * differ in how columns are placed and how much of each graph a cell shows.
 * Folding is not one of the differences — finished work eases shut into its
 * outcome node on every presentation, because the single success node is the
 * reward for a completed run wherever it is read.
 */
export type SemanticGraphPresentation = "conversation" | "columns" | "grid";

export interface SemanticGraphComposition {
  readonly workstreamId: string;
  readonly graphs: readonly WorkstreamGraph[];
  readonly presentation: SemanticGraphPresentation;
}

/*
 * The presentation a set of Director graphs should be drawn in.
 *
 * How many conversations is too many for columns is the backend's decision —
 * it is the same judgement that decides how much of each graph to send, and
 * two copies of one threshold in two languages would drift. So this reads what
 * the backend already said: a graph it compacted is one it does not expect to
 * be read as a column.
 */
export function directorPresentationFor(
  graphs: readonly WorkstreamGraph[],
  selectedWorkstreamId: string | null,
): SemanticGraphPresentation {
  if (selectedWorkstreamId !== null) {
    return "conversation";
  }
  return graphs.some((graph) => graph.detailLevel !== "selected") ? "grid" : "columns";
}

const settleWindowSeconds = 1.45;
const compactDelaySeconds = 2.5;
const workstreamLaneSpacing = 0.42;
/*
 * Where the Director's view stops being columns and becomes a grid.
 *
 * Past a handful of conversations, side-by-side columns are slivers: each one
 * loses the width its labels need and the view stops being readable at exactly
 * the moment it has the most to say. So the lane keeps its full column and the
 * conversations become tiles — each one its own cell, showing what it is doing
 * now rather than how it got there.
 */
const directorGridWidth = 1.45;
const directorGridBias = -0.36;
/** A tile's own vertical room, before its rows are laid inside it. */
const directorTileHeight = 0.62;
const directorLeadLane = -0.86;
/** How much of a conversation a tile shows: its latest activity, and no more. */
const maxTileNodes = 3;

interface OrderedNode {
  readonly node: SemanticNode;
  readonly packedId: string;
  readonly graphIndex: number;
  readonly graphOrder: number;
  readonly bornAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

interface PlannedNode {
  readonly ordered: OrderedNode;
  /** Turn index, which for a composition is the workstream's own column. */
  readonly turn: number;
  /** Row within that turn, so every column starts at its own top. */
  readonly row: number;
  readonly role: "input" | "step" | "outcome";
  readonly mode: PackedGraphMode;
  /**
   * When this outcome failed, or null. `terminalAt` is the renderer's failure
   * visual — the red burst and the eclipse — so a successful outcome must never
   * carry it: packing it for every outcome painted the end of every finished
   * run in the failure colour.
   */
  readonly failedAt: number | null;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} timestamp is invalid: ${value}`);
  }
  return timestamp / 1000;
}

export function semanticGraphTimeOriginSeconds(graphs: readonly WorkstreamGraph[]): number | null {
  let origin = Number.POSITIVE_INFINITY;
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      origin = Math.min(origin, parseTimestamp(node.createdAt, `semantic node ${node.id}`));
    }
  }
  return Number.isFinite(origin) ? origin : null;
}

function graphNodes(graphs: readonly WorkstreamGraph[]): OrderedNode[] {
  const records: OrderedNode[] = [];
  const base = semanticGraphTimeOriginSeconds(graphs) ?? 0;
  graphs.forEach((graph, graphIndex) => {
    graph.nodes.forEach((node, graphOrder) => {
      records.push({
        node,
        packedId: `${node.workstreamId}:${node.id}`,
        graphIndex,
        graphOrder,
        bornAt: parseTimestamp(node.createdAt, `semantic node ${node.id}`) - base,
        updatedAt: parseTimestamp(node.updatedAt, `semantic node ${node.id} update`) - base,
        completedAt:
          node.completedAt === null
            ? null
            : parseTimestamp(node.completedAt, `semantic node ${node.id} completion`) - base,
      });
    });
  });
  /*
   * Grouped by workstream, then in time within it.
   *
   * Ordering by time across the whole composition interleaved the workstreams,
   * which is the wrong shape for a set of columns: a column has to own one
   * contiguous run of nodes to be placed and folded as a unit. Time still
   * orders what happens inside a column, which is the only place it means
   * anything — two conversations do not share a clock the reader cares about.
   */
  records.sort((left, right) => {
    if (left.graphIndex !== right.graphIndex) {
      return left.graphIndex - right.graphIndex;
    }
    if (left.bornAt !== right.bornAt) {
      return left.bornAt - right.bornAt;
    }
    return left.graphOrder - right.graphOrder;
  });
  return records;
}

/*
 * A tile is the latest activity, not the trajectory behind it.
 *
 * The grid exists because there is no room to read every conversation at once,
 * so it answers what each one is doing now. Reducing here rather than folding
 * later keeps the reduction a property of the view: nothing has to animate
 * closed, and nothing can quietly re-open.
 */
function tiledGraphs(composition: SemanticGraphComposition): readonly WorkstreamGraph[] {
  if (composition.presentation !== "grid") {
    return composition.graphs;
  }
  return composition.graphs.map((graph, index) => {
    if (index === 0) {
      return graph;
    }
    const kept = graph.nodes.slice(-maxTileNodes);
    const keptIds = new Set(kept.map((node) => node.id));
    return {
      ...graph,
      nodes: kept,
      edges: graph.edges.filter(
        (edge) => keptIds.has(edge.fromNodeId) && keptIds.has(edge.toNodeId),
      ),
    };
  });
}

function graphEdges(graphs: readonly WorkstreamGraph[]): SemanticEdge[] {
  return graphs
    .flatMap((graph) => graph.edges)
    .sort((left, right) => {
      const leftTime = parseTimestamp(left.createdAt, `semantic edge ${left.id}`);
      const rightTime = parseTimestamp(right.createdAt, `semantic edge ${right.id}`);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });
}

function outgoingNodeIDs(edges: readonly SemanticEdge[]): ReadonlySet<string> {
  return new Set(edges.map((edge) => `${edge.workstreamId}:${edge.fromNodeId}`));
}

function terminalSeconds(ordered: OrderedNode): number {
  if (ordered.completedAt !== null) {
    return ordered.completedAt;
  }
  return Math.max(ordered.bornAt, ordered.updatedAt);
}

function outcomeNodeID(
  nodes: readonly OrderedNode[],
  outgoing: ReadonlySet<string>,
): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const ordered = nodes[index];
    if (ordered === undefined) {
      continue;
    }
    const visual = semanticNodeKindVisuals[ordered.node.kind];
    if (visual.role === "outcome" && !outgoing.has(ordered.packedId)) {
      return ordered.packedId;
    }
  }
  return null;
}

function plannedRole(
  ordered: OrderedNode,
  row: number,
  outcomeId: string | null,
): "input" | "step" | "outcome" {
  if (row === 0) {
    return "input";
  }
  if (ordered.packedId === outcomeId) {
    return "outcome";
  }
  return "step";
}

/*
 * Columns in the mockup's reading order: the Director's lane leads on the
 * left and threads follow to the right, the group centred as a whole. Past
 * the point columns stay readable, the backend compacts and the view becomes
 * the grid.
 *
 * Exported for the column-title overlay, which names each thread above its
 * column and must agree with the packer about where a column is.
 */
export function workstreamLane(graphIndex: number, graphCount: number): number {
  return (graphIndex - (graphCount - 1) / 2) * workstreamLaneSpacing;
}

interface ColumnPlacement {
  readonly lane: number;
  readonly top: number;
}

/*
 * Where each column sits.
 *
 * Few enough conversations and they are columns across the view, all starting
 * at the top. Too many and the first graph — the Director's own lane — keeps a
 * column on the left while the rest tile into a square-ish grid beside it, in
 * reading order: oldest top-left, newest bottom-right.
 */
function columnPlacements(
  graphCount: number,
  presentation: SemanticGraphPresentation,
): ColumnPlacement[] {
  if (presentation !== "grid") {
    return Array.from({ length: graphCount }, (_unused, index) => ({
      lane: workstreamLane(index, graphCount),
      top: 0,
    }));
  }
  const tiles = graphCount - 1;
  const across = Math.ceil(Math.sqrt(tiles));
  const down = Math.ceil(tiles / across);
  const cellWidth = directorGridWidth / across;
  const placements: ColumnPlacement[] = [{ lane: directorLeadLane, top: 0 }];
  for (let tile = 0; tile < tiles; tile += 1) {
    placements.push({
      lane: 0.24 + ((tile % across) - (across - 1) / 2) * cellWidth,
      top: (Math.floor(tile / across) - (down - 1) / 2) * directorTileHeight + directorGridBias,
    });
  }
  return placements;
}

function semanticLane(node: SemanticNode): number {
  switch (node.kind) {
    case "delegation":
      return 0.28;
    case "investigation":
      return -0.2;
    case "approval_required":
    case "resource_required":
    case "blocked":
    case "retry":
      return 0.2;
    case "artifact":
    case "validation":
      return -0.16;
    default:
      return 0;
  }
}

/*
 * Plans each workstream on its own.
 *
 * Rows are local to a column, because a column is a conversation read from its
 * own beginning: numbering rows across the whole composition put the second
 * conversation below the end of the first instead of beside its start. One turn
 * per workstream then makes folding mean what a reader expects — collapse this
 * conversation — rather than collapsing the view.
 *
 * Nodes arrive grouped by workstream and ordered within it, which is what lets
 * a turn own one contiguous run of nodes.
 */
function planNodes(nodes: readonly OrderedNode[], edges: readonly SemanticEdge[]): PlannedNode[] {
  const outgoing = outgoingNodeIDs(edges);
  const planned: PlannedNode[] = [];
  for (const group of groupedByGraph(nodes)) {
    const outcomeId = outcomeNodeID(group.nodes, outgoing);
    group.nodes.forEach((ordered, row) => {
      const role = plannedRole(ordered, row, outcomeId);
      planned.push({
        ordered,
        turn: group.turn,
        row,
        role,
        mode: semanticNodeMode(ordered.node.kind, ordered.node.status),
        failedAt:
          role === "outcome" && semanticStatusOutcomes[ordered.node.status] === "failed"
            ? terminalSeconds(ordered)
            : null,
      });
    });
  }
  return planned;
}

interface PlannedGroup {
  readonly turn: number;
  readonly nodes: readonly OrderedNode[];
}

/**
 * Splits the ordered nodes into one run per workstream. Turn indices count the
 * workstreams that actually have nodes, so they stay dense even when a graph in
 * the composition is empty.
 */
function groupedByGraph(nodes: readonly OrderedNode[]): PlannedGroup[] {
  const groups: PlannedGroup[] = [];
  let current: OrderedNode[] = [];
  let graphIndex = -1;
  for (const ordered of nodes) {
    if (ordered.graphIndex !== graphIndex && current.length > 0) {
      groups.push({ turn: groups.length, nodes: current });
      current = [];
    }
    graphIndex = ordered.graphIndex;
    current.push(ordered);
  }
  if (current.length > 0) {
    groups.push({ turn: groups.length, nodes: current });
  }
  return groups;
}

function packedNodeInput(planned: PlannedNode, placement: ColumnPlacement): PackedGraphNodeInput {
  const visual = semanticNodeKindVisuals[planned.ordered.node.kind];
  return {
    id: planned.ordered.packedId,
    turn: planned.turn,
    role: planned.role,
    mode: planned.mode,
    glyph: visual.glyph,
    emphasis: semanticEvidenceEmphases[planned.ordered.node.evidenceClass],
    detail: planned.ordered.node.kind === "milestone" ? "compacted" : "detailed",
    lane: placement.lane + semanticLane(planned.ordered.node),
    row: planned.row,
    bornAt: planned.ordered.bornAt,
    settleAt: planned.ordered.bornAt + settleWindowSeconds,
    terminalAt: planned.failedAt,
    label: planned.ordered.node.publicSummary,
    labelPlacement: planned.role === "input" ? "below" : visual.labelPlacement,
  };
}

function graphOutcome(planned: readonly PlannedNode[]): {
  readonly outcome: PackedGraphOutcome;
  readonly outcomeNodeId: string | null;
  readonly answerAt: number | null;
} {
  for (let index = planned.length - 1; index >= 0; index -= 1) {
    const candidate = planned[index];
    if (candidate === undefined || candidate.role !== "outcome") {
      continue;
    }
    return {
      outcome: semanticStatusOutcomes[candidate.ordered.node.status],
      outcomeNodeId: candidate.ordered.packedId,
      answerAt: terminalSeconds(candidate.ordered),
    };
  }
  return { outcome: "running", outcomeNodeId: null, answerAt: null };
}

/** One turn per column, each describing only its own workstream. */
function turnInputs(
  planned: readonly PlannedNode[],
  placementFor: (graphIndex: number) => ColumnPlacement,
): PackedGraphTurnInput[] {
  const byTurn = new Map<number, PlannedNode[]>();
  for (const node of planned) {
    const existing = byTurn.get(node.turn);
    if (existing === undefined) {
      byTurn.set(node.turn, [node]);
    } else {
      existing.push(node);
    }
  }
  const turns: PackedGraphTurnInput[] = [];
  for (const [index, nodes] of [...byTurn.entries()].sort(([left], [right]) => left - right)) {
    const input = nodes[0];
    if (input === undefined) {
      continue;
    }
    const outcome = graphOutcome(nodes);
    turns.push({
      index,
      column: index,
      columnTop: placementFor(input.ordered.graphIndex).top,
      inputNodeId: input.ordered.packedId,
      outcomeNodeId: outcome.outcomeNodeId,
      rowSpan: nodes.length,
      outcome: outcome.outcome,
      answerAt: outcome.answerAt,
      /*
       * Finished work folds itself, whatever the view: the ladder eases shut
       * a beat after the answer lands, leaving the outcome node carrying the
       * verdict. On a conversation the pill re-opens it; on the Director's
       * views a click enters the thread, where it can be reopened.
       */
      compactAt: outcome.answerAt === null ? null : outcome.answerAt + compactDelaySeconds,
      workstreamId: input.ordered.node.workstreamId,
    });
  }
  return turns;
}

function edgeInputs(
  edges: readonly SemanticEdge[],
  nodeIndexByID: ReadonlyMap<string, number>,
  nodeModeByID: ReadonlyMap<string, PackedGraphMode>,
  terminalByID: ReadonlyMap<string, boolean>,
): PackedGraphEdgeInput[] {
  return edges
    .map((edge) => {
      const fromNodeId = `${edge.workstreamId}:${edge.fromNodeId}`;
      const toNodeId = `${edge.workstreamId}:${edge.toNodeId}`;
      const from = nodeIndexByID.get(fromNodeId);
      const to = nodeIndexByID.get(toNodeId);
      if (from === undefined || to === undefined) {
        return null;
      }
      const visualFromNodeId = from < to ? fromNodeId : toNodeId;
      const visualToNodeId = from < to ? toNodeId : fromNodeId;
      const childMode = nodeModeByID.get(visualToNodeId);
      if (childMode === undefined) {
        throw new Error(
          `semantic graph edge ${edge.id} targets an unpacked node ${visualToNodeId}`,
        );
      }
      return {
        fromNodeId: visualFromNodeId,
        toNodeId: visualToNodeId,
        mode: semanticEdgeMode(edge.kind, childMode),
        channel: semanticEdgeChannels[edge.kind],
        confidence: edge.kind === "blocked_by" || edge.kind === "recovered_by" ? 0.58 : 0.92,
        terminated: terminalByID.get(visualToNodeId) ?? false,
      };
    })
    .filter((edge): edge is PackedGraphEdgeInput => edge !== null)
    .sort((left, right) => {
      const leftTarget = nodeIndexByID.get(left.toNodeId);
      const rightTarget = nodeIndexByID.get(right.toNodeId);
      if (leftTarget === undefined || rightTarget === undefined) {
        return 0;
      }
      if (leftTarget !== rightTarget) {
        return leftTarget - rightTarget;
      }
      return left.fromNodeId.localeCompare(right.fromNodeId);
    });
}

function compileSemanticGraphComposition(
  composition: SemanticGraphComposition,
): readonly PackedGraphBatch[] {
  if (composition.graphs.length === 0) {
    return [];
  }
  // One reduced set for both. Reading edges from the full graphs while nodes
  // came from the tiles let a dropped edge still decide which node is the
  // outcome, so a tile could be classified by history it is not showing.
  const graphs = tiledGraphs(composition);
  const nodes = graphNodes(graphs);
  if (nodes.length === 0) {
    return [];
  }
  const edges = graphEdges(graphs);
  const planned = planNodes(nodes, edges);
  const placements = columnPlacements(graphs.length, composition.presentation);
  const placementFor = (graphIndex: number): ColumnPlacement =>
    placements[graphIndex] ?? { lane: 0, top: 0 };
  const packedNodes = planned.map((node) =>
    packedNodeInput(node, placementFor(node.ordered.graphIndex)),
  );
  const nodeIndexByID = new Map(packedNodes.map((node, index) => [node.id, index]));
  const nodeModeByID = new Map(planned.map((node) => [node.ordered.packedId, node.mode]));
  const terminalByID = new Map(
    planned.map((node) => [node.ordered.packedId, node.failedAt !== null]),
  );
  const packedEdges = edgeInputs(edges, nodeIndexByID, nodeModeByID, terminalByID);
  return [
    {
      cursorSequence: packedNodes.length + packedEdges.length,
      hasEarlier: composition.graphs.some((graph) => graph.hasEarlier),
      nodes: packedNodes,
      edges: packedEdges,
      turns: turnInputs(planned, placementFor),
    },
  ];
}

export function packSemanticGraphComposition(
  composition: SemanticGraphComposition,
): PackedGraphSnapshot {
  return buildPackedGraphSnapshot(
    composition.workstreamId,
    compileSemanticGraphComposition(composition),
  );
}
