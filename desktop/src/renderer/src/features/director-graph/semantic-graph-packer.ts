/**
 * Packs generated Director semantic graph contracts for the WebGL2 renderer.
 *
 * The projector owns semantic meaning. This file only maps generated contract
 * values to the renderer's packed visual vocabulary and arranges a graph into
 * turn ladders the existing canvas can draw.
 */

import type { SemanticEdge, SemanticNode, WorkstreamGraph } from "@generated/backend";

import {
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
import type {
  PackedGraphEdgeChannel,
  PackedGraphMode,
  PackedGraphOutcome,
} from "./packed-graph-vocabulary";
import { graphFitFrame } from "./render/graph-visual-language";

/*
 * What the canvas is being asked to show.
 *
 * The three are genuinely different presentations, not one with settings: they
 * differ in how columns are placed and how much of each graph the overview shows.
 * A conversation may fold completed work into its outcome. Director overviews
 * are already bounded here: the Director remains a full spine, while each side
 * thread is either a short trail or one current activity node.
 */
export type SemanticGraphPresentation = "conversation" | "columns" | "grid";

export interface SemanticGraphViewport {
  readonly width: number;
  readonly height: number;
}

export interface SemanticGraphComposition {
  readonly workstreamId: string;
  readonly graphs: readonly WorkstreamGraph[];
  readonly presentation: SemanticGraphPresentation;
  /**
   * The real canvas size. Grid columns and rows are packed in screen-space
   * proportions, then converted back to the renderer's authored world units.
   * Omitting it keeps fixture callers deterministic in the reference frame.
   */
  readonly viewport?: SemanticGraphViewport;
}

/*
 * The presentation a set of Director graphs should be drawn in.
 *
 * Detail remains the backend's decision, but fit belongs to the renderer: a
 * set of full-detail graphs may be readable as columns in a wide window and
 * need the existing grid presentation after that same window narrows. The
 * minimum is based on the title and node envelopes, not a device preset.
 */
const directorColumnMinimumWidthPx = 176;
/** The outer canvas bands belong to flanking context even though the graph draws beneath them. */
const directorColumnBandFraction = 0.64;

export function directorPresentationFor(
  graphs: readonly WorkstreamGraph[],
  selectedWorkstreamId: string | null,
  viewport?: SemanticGraphViewport,
): SemanticGraphPresentation {
  if (selectedWorkstreamId !== null) {
    return "conversation";
  }
  if (graphs.some((graph) => graph.detailLevel !== "selected")) {
    return "grid";
  }
  if (
    viewport !== undefined &&
    viewport.width * directorColumnBandFraction < graphs.length * directorColumnMinimumWidthPx
  ) {
    return "grid";
  }
  return "columns";
}

const settleWindowSeconds = 1.45;
const compactDelaySeconds = 2.5;
const workstreamLaneSpacing = 0.42;
/** Wide column views can spend more room on names without becoming sparse. */
const workstreamMaximumLaneSpacingPx = 320;
/*
 * How many worker threads can still carry a short readable trail in the grid.
 *
 * The first graph is the Director's own full-height centre lane. Beyond six
 * workers, each worker becomes one centred activity node; the Director keeps
 * its trajectory because it is the primary object in this view.
 */
const directorGridTrailThreadLimit = 6;
/**
 * How much of a side conversation a grid tile shows: the newest node in focus
 * with a short trail behind it. The Director's first graph is never reduced.
 */
export const directorGridTrailNodeCount = 3;
const defaultGridViewport = { width: 800, height: 1024 } as const;
/**
 * Fixed node envelopes remain distinct here; longer names disclose through
 * the title tooltip.
 */
const expandedGridMinimumCellWidthPx = 156;
/*
 * Three-node tiles need more than their graph's centre-to-centre height.
 *
 * The next row's title occupies the band above its input, while the previous
 * row's outcome carries a large particle envelope below its last edge. At the
 * compact tall-window size, viewport division could collapse that pitch to
 * about 260px, putting both in the same band. This is therefore a fit
 * threshold: if every trail cannot retain the pitch, workers reduce to current
 * activity instead of creating vertical scroll.
 */
const expandedGridMinimumCellHeightPx = 440;
/*
 * A high-count grid is allowed to become taller than the viewport.
 *
 * Squeezing a hundred activity nodes into one screen made the graph look like
 * a status matrix and left no honest width for thread names. The camera already
 * supports vertical look-back, so spend that dimension: four worker columns per
 * flank at a 1920px viewport leaves a readable title measure and a full node of
 * clearance between rows.
 */
const activityGridMinimumCellWidthPx = 150;
const activityGridMinimumCellHeightPx = 144;

interface GridPlacementFrame {
  readonly availableHeight: number;
  readonly directorGridGapPx: number;
  readonly directorWidthPx: number;
  readonly flankWidthPx: number;
  readonly fullestFlankCount: number;
  readonly workerCount: number;
  readonly worldPixelsX: number;
  readonly worldPixelsY: number;
}

interface GridCellLayout {
  readonly across: number;
  readonly cellHeightPx: number;
  readonly cellWidthPx: number;
  readonly fitsViewport: boolean;
}

function gridPlacementFrame(
  graphCount: number,
  viewport: SemanticGraphViewport | undefined,
): GridPlacementFrame {
  const safeViewport = {
    width: Math.max(1, viewport?.width ?? defaultGridViewport.width),
    height: Math.max(1, viewport?.height ?? defaultGridViewport.height),
  };
  const fit = graphFitFrame(safeViewport.width, safeViewport.height);
  const worldPixelsX = Math.max(1, safeViewport.width * fit.fitX * 0.5);
  const worldPixelsY = Math.max(1, safeViewport.height * fit.fitY * 0.5);
  const inlineInset = Math.min(64, Math.max(32, safeViewport.width * 0.03));
  const availableWidth = Math.max(240, safeViewport.width - inlineInset * 2);
  /*
   * The title bar and composer own this vertical band. Do not invent minimum
   * scene height below it: a tiny viewport must reduce its worker detail, not
   * create a supporting-grid scroll range just to preserve an ideal pitch.
   */
  const availableHeight = Math.max(1, safeViewport.height - 260);
  const workerCount = Math.max(0, graphCount - 1);
  const directorWidthPx = Math.min(260, Math.max(112, availableWidth * 0.2));
  const directorGridGapPx = Math.min(28, Math.max(16, availableWidth * 0.02));
  const flankWidthPx = Math.max(
    1,
    (availableWidth - directorWidthPx - directorGridGapPx * 2) * 0.5,
  );
  return {
    availableHeight,
    directorGridGapPx,
    directorWidthPx,
    flankWidthPx,
    fullestFlankCount: Math.ceil(workerCount * 0.5),
    workerCount,
    worldPixelsX,
    worldPixelsY,
  };
}

function gridCellLayout(
  frame: GridPlacementFrame,
  minimumCellWidthPx: number,
  minimumCellHeightPx: number,
): GridCellLayout {
  const { availableHeight, flankWidthPx, fullestFlankCount } = frame;
  if (fullestFlankCount === 0) {
    return {
      across: 1,
      cellHeightPx: availableHeight,
      cellWidthPx: flankWidthPx,
      fitsViewport: true,
    };
  }
  const idealAcross = Math.ceil(Math.sqrt(fullestFlankCount * (flankWidthPx / availableHeight)));
  const maximumAcross = Math.max(1, Math.floor(flankWidthPx / minimumCellWidthPx));
  const rowsThatFit = Math.max(1, Math.floor(availableHeight / minimumCellHeightPx));
  const minimumAcrossToFit = Math.ceil(fullestFlankCount / rowsThatFit);
  const across = Math.max(
    1,
    Math.min(fullestFlankCount, maximumAcross, Math.max(idealAcross, minimumAcrossToFit)),
  );
  const down = Math.ceil(fullestFlankCount / across);
  return {
    across,
    // Fit the authored rows to the usable area. Minimums choose the level of
    // detail and column count; they never manufacture off-screen scene height.
    cellHeightPx: availableHeight / down,
    cellWidthPx: flankWidthPx / across,
    fitsViewport: down * minimumCellHeightPx <= availableHeight,
  };
}

function singleRowGridCellLayout(frame: GridPlacementFrame): GridCellLayout {
  const across = Math.max(1, frame.fullestFlankCount);
  return {
    across,
    cellHeightPx: frame.availableHeight,
    cellWidthPx: frame.flankWidthPx / across,
    fitsViewport: true,
  };
}

/**
 * Whether worker tiles need to collapse to their one current activity node.
 *
 * Count is the hard density ceiling. At lower counts, trail detail is retained
 * only when all three-node tiles fit the actual viewport at their readable
 * envelope; otherwise the same threads become activity nodes without adding a
 * scroll range. Callers without a viewport retain the deterministic reference
 * behavior used by contract fixtures.
 */
export function directorGridUsesActivityNodes(
  graphCount: number,
  viewport?: SemanticGraphViewport,
): boolean {
  if (Math.max(0, graphCount - 1) > directorGridTrailThreadLimit) {
    return true;
  }
  if (viewport === undefined) {
    return false;
  }
  return !gridCellLayout(
    gridPlacementFrame(graphCount, viewport),
    expandedGridMinimumCellWidthPx,
    expandedGridMinimumCellHeightPx,
  ).fitsViewport;
}

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
  /** Lateral offset when this node is one branch of a concurrent fan. */
  readonly fanLane: number;
  /** A dense-grid activity node stays centred in its collision-free cell. */
  readonly centered: boolean;
  readonly mode: PackedGraphMode;
  /**
   * When this reasoning fact failed, or null. `terminalAt` drives the mockup's
   * brief burst/suck transition for a failed dead end. Inputs and final failed
   * outcomes stay full-size fail-mode nodes: their red eclipse comes from
   * `mode`, not from this transition clock.
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
 * A Director grid is a bounded summary, not every complete trajectory.
 *
 * Side-by-side columns retain complete visible trajectories because each
 * column can scroll and clamp at its own ends. Grid tiles keep a short recent
 * trail; once the grid crosses the activity threshold, they answer only what
 * each conversation is doing now. The Director's first graph always remains
 * its full spine.
 */
function gridGraphs(
  composition: SemanticGraphComposition,
  activityNodesOnly: boolean,
): readonly WorkstreamGraph[] {
  if (composition.presentation !== "grid") {
    return composition.graphs;
  }
  return composition.graphs.map((graph, index) => {
    if (index === 0) {
      return graph;
    }
    const kept = graph.nodes.slice(activityNodesOnly ? -1 : -directorGridTrailNodeCount);
    if (activityNodesOnly) {
      return { ...graph, nodes: kept, edges: [] };
    }
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
function workstreamLane(
  graphIndex: number,
  graphCount: number,
  viewport?: SemanticGraphViewport,
): number {
  if (viewport === undefined) {
    return (graphIndex - (graphCount - 1) / 2) * workstreamLaneSpacing;
  }
  const safeWidth = Math.max(1, viewport.width);
  const fit = graphFitFrame(safeWidth, Math.max(1, viewport.height));
  const worldPixelsX = Math.max(1, safeWidth * fit.fitX * 0.5);
  const referenceSpacingPx = workstreamLaneSpacing * worldPixelsX;
  const availableSpacingPx = Math.max(
    referenceSpacingPx,
    (safeWidth * directorColumnBandFraction) / Math.max(1, graphCount),
  );
  const spacing = Math.min(workstreamMaximumLaneSpacingPx, availableSpacingPx) / worldPixelsX;
  return (graphIndex - (graphCount - 1) / 2) * spacing;
}

interface ColumnPlacement {
  readonly lane: number;
  readonly top: number;
}

/*
 * Where each column sits.
 *
 * Few enough conversations and they are columns across the view, all starting
 * at the top. The grid reserves a full-height centre spine for the Director and
 * alternates workers into viewport-shaped flanks on either side. It is authored
 * in CSS pixels and converted to world coordinates with the same fit the
 * renderer applies. A landscape window therefore earns more columns instead
 * of a wider empty letterbox around the same narrow square.
 */
function columnPlacements(
  graphs: readonly WorkstreamGraph[],
  presentation: SemanticGraphPresentation,
  viewport: SemanticGraphViewport | undefined,
): ColumnPlacement[] {
  const graphCount = graphs.length;
  if (presentation !== "grid") {
    return linearColumnPlacements(graphCount, viewport);
  }
  const frame = gridPlacementFrame(graphCount, viewport);
  if (frame.workerCount === 0) {
    return [{ lane: 0, top: 0 }];
  }
  return gridColumnPlacements(frame, graphCount, viewport);
}

function linearColumnPlacements(
  graphCount: number,
  viewport: SemanticGraphViewport | undefined,
): ColumnPlacement[] {
  return Array.from({ length: graphCount }, (_unused, index) => ({
    lane: workstreamLane(index, graphCount, viewport),
    top: 0,
  }));
}

function gridColumnPlacements(
  frame: GridPlacementFrame,
  graphCount: number,
  viewport: SemanticGraphViewport | undefined,
): ColumnPlacement[] {
  const activityNodesOnly = directorGridUsesActivityNodes(graphCount, viewport);
  const minimumCellWidth = activityNodesOnly
    ? activityGridMinimumCellWidthPx
    : expandedGridMinimumCellWidthPx;
  const minimumCellHeight = activityNodesOnly
    ? activityGridMinimumCellHeightPx
    : expandedGridMinimumCellHeightPx;
  const fitFallback = usesSingleRowGridFallback(activityNodesOnly, frame.workerCount, viewport);
  const { across, cellHeightPx, cellWidthPx } = fitFallback
    ? // A low-count view that could not afford trail envelopes gets one quiet
      // row of current activity. It must not turn into a scrollable mini-grid.
      singleRowGridCellLayout(frame)
    : gridCellLayout(frame, minimumCellWidth, minimumCellHeight);
  const placements: ColumnPlacement[] = [
    {
      lane: 0,
      top: 0,
    },
  ];
  const leftInnerEdgePx = -frame.directorWidthPx * 0.5 - frame.directorGridGapPx;
  const rightInnerEdgePx = frame.directorWidthPx * 0.5 + frame.directorGridGapPx;
  for (let workerIndex = 0; workerIndex < frame.workerCount; workerIndex += 1) {
    const localIndex = Math.floor(workerIndex * 0.5);
    const column = localIndex % across;
    const leftFlank = workerIndex % 2 === 0;
    const centerPx = leftFlank
      ? leftInnerEdgePx - (column + 0.5) * cellWidthPx
      : rightInnerEdgePx + (column + 0.5) * cellWidthPx;
    placements.push({
      lane: centerPx / frame.worldPixelsX,
      top: (Math.floor(localIndex / across) * cellHeightPx) / frame.worldPixelsY,
    });
  }
  return placements;
}

function usesSingleRowGridFallback(
  activityNodesOnly: boolean,
  workerCount: number,
  viewport: SemanticGraphViewport | undefined,
): boolean {
  return activityNodesOnly && workerCount <= directorGridTrailThreadLimit && viewport !== undefined;
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
function planNodes(
  nodes: readonly OrderedNode[],
  edges: readonly SemanticEdge[],
  activityNodesOnly: boolean,
  fanLanes: ReadonlyMap<string, number>,
): PlannedNode[] {
  const outgoing = outgoingNodeIDs(edges);
  const planned: PlannedNode[] = [];
  for (const group of groupedByGraph(nodes)) {
    const outcomeId = outcomeNodeID(group.nodes, outgoing);
    const singleActivityNode = activityNodesOnly && group.nodes.length === 1;
    group.nodes.forEach((ordered, row) => {
      const role = plannedRole(ordered, row, outcomeId);
      planned.push({
        ordered,
        turn: group.turn,
        row,
        role,
        fanLane: singleActivityNode ? 0 : (fanLanes.get(ordered.packedId) ?? 0),
        centered: singleActivityNode,
        mode: semanticNodeMode(ordered.node.kind, ordered.node.status),
        failedAt:
          role === "step" &&
          !singleActivityNode &&
          semanticStatusOutcomes[ordered.node.status] === "failed"
            ? terminalSeconds(ordered)
            : null,
      });
    });
  }
  return planned;
}

interface FanLayout {
  readonly laneByNodeID: ReadonlyMap<string, number>;
  readonly branchEdgeIDs: ReadonlySet<string>;
  readonly mergeEdgeIDs: ReadonlySet<string>;
}

interface FanCandidate {
  readonly edgeKey: string;
  readonly target: string;
}

interface FlowTopology {
  readonly incomingFlowCount: ReadonlyMap<string, number>;
  readonly siblingsBySource: ReadonlyMap<string, readonly FanCandidate[]>;
}

function edgeKey(edge: SemanticEdge): string {
  return `${edge.workstreamId}:${edge.id}`;
}

/*
 * Where genuine concurrent branches sit and which chronology edges enter and
 * leave them.
 *
 * The projector already expresses real parallel work as overlapping
 * `followed_by` siblings from one fork and several `followed_by` edges into the
 * merge. Semantic relationships such as `delegated_to`, `depends_on`, or
 * `validated_by` describe why two facts relate; they do not, on their own, say
 * that those facts ran in parallel. Keeping that distinction here prevents a
 * linear delegation or approval from being drawn as an invented fork.
 */
function fanLayout(nodes: readonly OrderedNode[], edges: readonly SemanticEdge[]): FanLayout {
  const timing = new Map(nodes.map((ordered) => [ordered.packedId, ordered]));
  const topology = flowTopology(edges);
  const { branchEdgeIDs, laneByNodeID } = branchFanLayout(topology, timing);
  return {
    laneByNodeID,
    branchEdgeIDs,
    mergeEdgeIDs: fanMergeEdgeIDs(edges, laneByNodeID),
  };
}

function flowTopology(edges: readonly SemanticEdge[]): FlowTopology {
  const siblingsBySource = new Map<string, FanCandidate[]>();
  const incomingFlowCount = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== "followed_by") {
      continue;
    }
    const target = `${edge.workstreamId}:${edge.toNodeId}`;
    incomingFlowCount.set(target, (incomingFlowCount.get(target) ?? 0) + 1);
    const source = `${edge.workstreamId}:${edge.fromNodeId}`;
    const members = siblingsBySource.get(source);
    const candidate = { edgeKey: edgeKey(edge), target } satisfies FanCandidate;
    if (members === undefined) {
      siblingsBySource.set(source, [candidate]);
    } else {
      members.push(candidate);
    }
  }
  return { incomingFlowCount, siblingsBySource };
}

function branchFanLayout(
  topology: FlowTopology,
  timing: ReadonlyMap<string, OrderedNode>,
): Pick<FanLayout, "branchEdgeIDs" | "laneByNodeID"> {
  const spacing = 0.3;
  const laneByNodeID = new Map<string, number>();
  const branchEdgeIDs = new Set<string>();
  for (const candidates of topology.siblingsBySource.values()) {
    const members = candidates.map((candidate) => candidate.target);
    if (members.length < 2) {
      continue;
    }
    const cluster = concurrentCluster(members, timing).filter(
      (member) => (topology.incomingFlowCount.get(member) ?? 0) <= 1,
    );
    if (cluster.length < 2) {
      continue;
    }
    const clusterIDs = new Set(cluster);
    cluster.forEach((member, index) => {
      laneByNodeID.set(member, (index - (cluster.length - 1) / 2) * spacing);
    });
    for (const candidate of candidates) {
      if (clusterIDs.has(candidate.target)) {
        branchEdgeIDs.add(candidate.edgeKey);
      }
    }
  }
  return { laneByNodeID, branchEdgeIDs };
}

function fanMergeEdgeIDs(
  edges: readonly SemanticEdge[],
  laneByNodeID: ReadonlyMap<string, number>,
): ReadonlySet<string> {
  const mergeCandidates = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "followed_by") {
      continue;
    }
    const source = `${edge.workstreamId}:${edge.fromNodeId}`;
    if (!laneByNodeID.has(source)) {
      continue;
    }
    const target = `${edge.workstreamId}:${edge.toNodeId}`;
    const candidates = mergeCandidates.get(target);
    if (candidates === undefined) {
      mergeCandidates.set(target, [edgeKey(edge)]);
    } else {
      candidates.push(edgeKey(edge));
    }
  }
  const mergeEdgeIDs = new Set<string>();
  for (const candidates of mergeCandidates.values()) {
    if (candidates.length < 2) {
      continue;
    }
    for (const edgeID of candidates) {
      mergeEdgeIDs.add(edgeID);
    }
  }
  return mergeEdgeIDs;
}

/** The members whose lifetimes overlap the sibling before them. */
function concurrentCluster(
  members: readonly string[],
  timing: ReadonlyMap<string, OrderedNode>,
): string[] {
  const cluster: string[] = [];
  let previousEnds = Number.NEGATIVE_INFINITY;
  for (const member of members) {
    const ordered = timing.get(member);
    if (ordered === undefined) {
      continue;
    }
    if (cluster.length === 0 || ordered.bornAt < previousEnds) {
      cluster.push(member);
    } else {
      // A gap breaks the fan; keep the widest run seen so far.
      if (cluster.length >= 2) {
        break;
      }
      cluster.length = 0;
      cluster.push(member);
    }
    previousEnds = ordered.completedAt ?? Number.POSITIVE_INFINITY;
  }
  return cluster;
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
    /*
     * Node kind does not imply topology. Ordinary actions, delegations,
     * approvals, artifacts, and validations all stay on their workstream's
     * spine. Only a concurrently planned sibling earns a lateral lane.
     */
    lane: placement.lane + (planned.centered ? 0 : planned.fanLane),
    row: planned.row,
    bornAt: planned.ordered.bornAt,
    /*
     * A state change is motion, not a swap: the settle window reopens at every
     * durable update, so a node that just changed status swells and its
     * particles flare for a beat — the working envelope doubling as the
     * transition animation. Derived from updatedAt, so replay animates the
     * same frames a live push did.
     */
    settleAt: Math.max(
      planned.ordered.bornAt + settleWindowSeconds,
      planned.ordered.updatedAt + settleWindowSeconds * 0.6,
    ),
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
  folding: boolean,
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
    const placement = placementFor(input.ordered.graphIndex);
    turns.push({
      index,
      column: index,
      columnTop: placement.top,
      inputNodeId: input.ordered.packedId,
      outcomeNodeId: outcome.outcomeNodeId,
      rowSpan: nodes.length,
      outcome: outcome.outcome,
      answerAt: outcome.answerAt,
      /*
       * A conversation folds finished work a beat after the answer lands. A
       * Director overview was already reduced to a short trail or one activity
       * node before it reached this turn representation, so it stays open.
       */
      compactAt:
        !folding || outcome.answerAt === null ? null : outcome.answerAt + compactDelaySeconds,
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
  fans: FanLayout,
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
        channel: edgeChannel(edge, fans),
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

function edgeChannel(edge: SemanticEdge, fans: FanLayout): PackedGraphEdgeChannel {
  const key = edgeKey(edge);
  if (fans.branchEdgeIDs.has(key)) {
    return "branch";
  }
  if (fans.mergeEdgeIDs.has(key)) {
    return "merge";
  }
  return "flow";
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
  const activityNodesOnly =
    composition.presentation === "grid" &&
    directorGridUsesActivityNodes(composition.graphs.length, composition.viewport);
  const graphs = gridGraphs(composition, activityNodesOnly);
  const nodes = graphNodes(graphs);
  if (nodes.length === 0) {
    return [];
  }
  const edges = graphEdges(graphs);
  const fans = fanLayout(nodes, edges);
  const planned = planNodes(nodes, edges, activityNodesOnly, fans.laneByNodeID);
  const placements = columnPlacements(graphs, composition.presentation, composition.viewport);
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
  const packedEdges = edgeInputs(edges, nodeIndexByID, nodeModeByID, terminalByID, fans);
  const folding = composition.presentation === "conversation";
  return [
    {
      cursorSequence: packedNodes.length + packedEdges.length,
      hasEarlier: composition.graphs.some((graph) => graph.hasEarlier),
      nodes: packedNodes,
      edges: packedEdges,
      turns: turnInputs(planned, placementFor, folding),
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
