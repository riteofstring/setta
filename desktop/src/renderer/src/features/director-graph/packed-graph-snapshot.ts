/**
 * The packed GPU render snapshot boundary.
 *
 * ```text
 * semantic graph snapshot  ->  packed render snapshot  ->  WebGL2 renderer
 * ```
 *
 * The semantic graph snapshot owns ids, kinds, statuses, evidence classes,
 * source event ids, public summaries, and edge meaning. This boundary owns
 * numeric handles, typed-array columns, authored layout coordinates, glyph
 * indices, edge endpoints, and level-of-detail buckets. Nothing downstream of
 * here makes a product decision.
 *
 * Two properties make the boundary usable by a live push path:
 *
 * 1. **Event order is the column order.** Columns are appended in the durable
 *    order the projector committed them, so the snapshot at an earlier cursor
 *    is exactly a prefix of a later one, and a cold replay reaches the same
 *    columns a live push did.
 * 2. **Every snapshot is immutable and reports what changed.** Extending
 *    allocates fresh columns rather than writing into a previous snapshot's
 *    arrays, and `changed` names the first touched index per column group so
 *    the renderer re-uploads a range instead of a whole buffer.
 *
 * Camera position, selection, hover, fold state, and animation phase are view
 * state. They influence rendering and never enter these columns.
 */

import {
  boundGraphLabel,
  packedGraphDetailCode,
  packedGraphEdgeChannelCode,
  packedGraphEmphasisCode,
  packedGraphGlyphCode,
  packedGraphLabelPlacementCode,
  packedGraphModeCode,
  packedGraphNever,
  packedGraphOutcomeCode,
  packedGraphRoleCode,
  packedValueAt,
  type PackedGraphDetail,
  type PackedGraphEdgeChannel,
  type PackedGraphEmphasis,
  type PackedGraphGlyph,
  type PackedGraphLabelPlacement,
  type PackedGraphMode,
  type PackedGraphOutcome,
  type PackedGraphRole,
} from "./packed-graph-vocabulary";
import { validatePackedGraphBatch } from "./packed-graph-validation";

/** One visible fact, in the durable order it was committed. */
export interface PackedGraphNodeInput {
  readonly id: string;
  /** Index of the owning turn ladder. */
  readonly turn: number;
  readonly role: PackedGraphRole;
  readonly mode: PackedGraphMode;
  readonly glyph: PackedGraphGlyph;
  readonly emphasis: PackedGraphEmphasis;
  readonly detail: PackedGraphDetail;
  /** Authored lane offset in reference-frame clip units; 0 is the spine. */
  readonly lane: number;
  /** Row inside the turn. The input node is row 0. */
  readonly row: number;
  readonly bornAt: number;
  /**
   * When this node stops reading as "working" if it never produces a child.
   * Producing a child collapses it to the child's birth, which is why the
   * builder derives the packed value instead of storing this one unchanged.
   */
  readonly settleAt: number;
  /** When the node terminated as a dead end, or null when it did not. */
  readonly terminalAt: number | null;
  readonly label: string;
  readonly labelPlacement: PackedGraphLabelPlacement;
}

/** One typed relationship, resolved to node ids. */
export interface PackedGraphEdgeInput {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly mode: PackedGraphMode;
  readonly channel: PackedGraphEdgeChannel;
  /** 0..1; modulates the beam. Full confidence is the default state. */
  readonly confidence: number;
  /** The edge ends at a terminated branch. */
  readonly terminated: boolean;
}

/** One turn ladder: input node, reasoning rows, outcome node. */
export interface PackedGraphTurnInput {
  readonly index: number;
  /*
   * The column this turn stacks in.
   *
   * A conversation is one column and its turns run down it. A composition of
   * several conversations is several columns side by side, and each runs down
   * its own: a turn's top follows the turn above it *in its column*, not the
   * turn that happened to be packed before it somewhere else.
   */
  readonly column: number;
  /*
   * Where this column's first turn starts, in world units.
   *
   * A conversation starts at the top of the view and runs down. A tile in the
   * Director's grid starts in its own cell, which is what lets many
   * conversations be on screen at once without becoming a row of slivers.
   */
  readonly columnTop: number;
  /** The workstream this column draws, so a click on it can open that thread. */
  readonly workstreamId: string;
  readonly inputNodeId: string;
  /** Null while the turn is still running. */
  readonly outcomeNodeId: string | null;
  /** Rows the turn occupies, including its outcome row. */
  readonly rowSpan: number;
  readonly outcome: PackedGraphOutcome;
  readonly answerAt: number | null;
  /** When the answered ladder folds, or null while it stays expanded. */
  readonly compactAt: number | null;
}

/**
 * One pushed batch of committed graph facts. A batch is what arrives between
 * two durable cursor positions; the renderer applies at most one per frame.
 */
export interface PackedGraphBatch {
  readonly cursorSequence: number;
  /** Older nodes exist outside the window, so the renderer draws a boundary. */
  readonly hasEarlier: boolean;
  readonly nodes: readonly PackedGraphNodeInput[];
  readonly edges: readonly PackedGraphEdgeInput[];
  /** Turn records created or updated by this batch, in ascending index order. */
  readonly turns: readonly PackedGraphTurnInput[];
}

interface PackedGraphNodeColumns {
  readonly ids: readonly string[];
  readonly labels: readonly string[];
  readonly turn: Uint16Array;
  readonly role: Uint8Array;
  readonly mode: Uint8Array;
  readonly glyph: Uint8Array;
  readonly emphasis: Uint8Array;
  readonly detail: Uint8Array;
  readonly terminal: Uint8Array;
  readonly lane: Float32Array;
  readonly row: Uint16Array;
  readonly bornAt: Float32Array;
  readonly settleAt: Float32Array;
  readonly terminalAt: Float32Array;
  readonly labelPlacement: Uint8Array;
  readonly labelTruncated: Uint8Array;
}

interface PackedGraphEdgeColumns {
  readonly from: Uint32Array;
  readonly to: Uint32Array;
  readonly mode: Uint8Array;
  readonly channel: Uint8Array;
  readonly confidence: Float32Array;
  /** Derived from the child's birth: an edge grows as its child arrives. */
  readonly bornAt: Float32Array;
  readonly terminated: Uint8Array;
}

interface PackedGraphTurnColumns {
  /** Which column each turn stacks in. See PackedGraphTurnInput.column. */
  readonly column: Uint16Array;
  /** Where each column starts. See PackedGraphTurnInput.columnTop. */
  readonly columnTop: Float32Array;
  readonly inputNode: Uint32Array;
  /** -1 while the turn is still running. */
  readonly outcomeNode: Int32Array;
  readonly rowSpan: Uint16Array;
  readonly outcome: Uint8Array;
  readonly answerAt: Float32Array;
  readonly compactAt: Float32Array;
}

/**
 * First index whose packed data differs from the previous snapshot, per column
 * group. A value equal to the group's count means nothing changed.
 */
interface PackedGraphChangedRanges {
  readonly nodesFrom: number;
  readonly edgesFrom: number;
  readonly turnsFrom: number;
}

export interface PackedGraphSnapshot {
  readonly workstreamId: string;
  readonly cursorSequence: number;
  readonly hasEarlier: boolean;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly turnCount: number;
  readonly changed: PackedGraphChangedRanges;
  readonly nodes: PackedGraphNodeColumns;
  readonly edges: PackedGraphEdgeColumns;
  readonly turns: PackedGraphTurnColumns;
  /** Each turn's workstream, indexed by turn. See PackedGraphTurnInput.workstreamId. */
  readonly turnWorkstreamIds: readonly string[];
  readonly nodeIndexById: ReadonlyMap<string, number>;
}

interface MutableNodeColumns extends Omit<PackedGraphNodeColumns, "ids" | "labels"> {
  ids: string[];
  labels: string[];
}

function grownU8(source: Uint8Array, used: number, size: number): Uint8Array {
  const next = new Uint8Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownU16(source: Uint16Array, used: number, size: number): Uint16Array {
  const next = new Uint16Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownU32(source: Uint32Array, used: number, size: number): Uint32Array {
  const next = new Uint32Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownI32(source: Int32Array, used: number, size: number): Int32Array {
  const next = new Int32Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownF32(source: Float32Array, used: number, size: number): Float32Array {
  const next = new Float32Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownNodeColumns(
  source: PackedGraphNodeColumns,
  used: number,
  size: number,
): MutableNodeColumns {
  return {
    ids: source.ids.slice(0, used),
    labels: source.labels.slice(0, used),
    turn: grownU16(source.turn, used, size),
    role: grownU8(source.role, used, size),
    mode: grownU8(source.mode, used, size),
    glyph: grownU8(source.glyph, used, size),
    emphasis: grownU8(source.emphasis, used, size),
    detail: grownU8(source.detail, used, size),
    terminal: grownU8(source.terminal, used, size),
    lane: grownF32(source.lane, used, size),
    row: grownU16(source.row, used, size),
    bornAt: grownF32(source.bornAt, used, size),
    settleAt: grownF32(source.settleAt, used, size),
    terminalAt: grownF32(source.terminalAt, used, size),
    labelPlacement: grownU8(source.labelPlacement, used, size),
    labelTruncated: grownU8(source.labelTruncated, used, size),
  };
}

function grownEdgeColumns(
  source: PackedGraphEdgeColumns,
  used: number,
  size: number,
): PackedGraphEdgeColumns {
  return {
    from: grownU32(source.from, used, size),
    to: grownU32(source.to, used, size),
    mode: grownU8(source.mode, used, size),
    channel: grownU8(source.channel, used, size),
    confidence: grownF32(source.confidence, used, size),
    bornAt: grownF32(source.bornAt, used, size),
    terminated: grownU8(source.terminated, used, size),
  };
}

function grownTurnColumns(
  source: PackedGraphTurnColumns,
  used: number,
  size: number,
): PackedGraphTurnColumns {
  return {
    column: grownU16(source.column, used, size),
    columnTop: grownF32(source.columnTop, used, size),
    inputNode: grownU32(source.inputNode, used, size),
    outcomeNode: grownI32(source.outcomeNode, used, size),
    rowSpan: grownU16(source.rowSpan, used, size),
    outcome: grownU8(source.outcome, used, size),
    answerAt: grownF32(source.answerAt, used, size),
    compactAt: grownF32(source.compactAt, used, size),
  };
}

function nodeIndexOf(indexById: ReadonlyMap<string, number>, nodeId: string): number {
  const index = indexById.get(nodeId);
  if (index === undefined) {
    throw new Error(`packed graph batch references unknown node ${nodeId}`);
  }
  return index;
}

function writeNode(columns: MutableNodeColumns, index: number, node: PackedGraphNodeInput): void {
  const label = boundGraphLabel(node.label);
  columns.ids[index] = node.id;
  columns.labels[index] = label.text;
  columns.turn[index] = node.turn;
  columns.role[index] = packedGraphRoleCode[node.role];
  columns.mode[index] = packedGraphModeCode[node.mode];
  columns.glyph[index] = packedGraphGlyphCode[node.glyph];
  columns.emphasis[index] = packedGraphEmphasisCode[node.emphasis];
  columns.detail[index] = packedGraphDetailCode[node.detail];
  columns.terminal[index] = node.terminalAt === null ? 0 : 1;
  columns.lane[index] = node.lane;
  columns.row[index] = node.row;
  columns.bornAt[index] = node.bornAt;
  columns.settleAt[index] = node.terminalAt ?? node.settleAt;
  columns.terminalAt[index] = node.terminalAt ?? packedGraphNever;
  columns.labelPlacement[index] = packedGraphLabelPlacementCode[node.labelPlacement];
  columns.labelTruncated[index] = label.truncated ? 1 : 0;
}

function writeTurn(
  columns: PackedGraphTurnColumns,
  indexById: ReadonlyMap<string, number>,
  turn: PackedGraphTurnInput,
): void {
  columns.column[turn.index] = turn.column;
  columns.columnTop[turn.index] = turn.columnTop;
  columns.inputNode[turn.index] = nodeIndexOf(indexById, turn.inputNodeId);
  columns.outcomeNode[turn.index] =
    turn.outcomeNodeId === null ? -1 : nodeIndexOf(indexById, turn.outcomeNodeId);
  columns.rowSpan[turn.index] = turn.rowSpan;
  columns.outcome[turn.index] = packedGraphOutcomeCode[turn.outcome];
  columns.answerAt[turn.index] = turn.answerAt ?? packedGraphNever;
  columns.compactAt[turn.index] = turn.compactAt ?? packedGraphNever;
}

interface EdgeWriteContext {
  readonly nodes: MutableNodeColumns;
  readonly edges: PackedGraphEdgeColumns;
  readonly indexById: ReadonlyMap<string, number>;
  readonly firstEdge: number;
}

/**
 * Writes appended edges and collapses each parent's settle time onto its
 * earliest child. A node stops reading as "working" once it has produced its
 * next fact, so appending a child is exactly what settles its parent — and
 * that rewrite is why an append can change a node from an earlier batch.
 */
function writeEdges(context: EdgeWriteContext, appended: readonly PackedGraphEdgeInput[]): number {
  const { nodes, edges, indexById } = context;
  let nodesFrom = Number.POSITIVE_INFINITY;
  let cursor = context.firstEdge;
  for (const edge of appended) {
    const from = nodeIndexOf(indexById, edge.fromNodeId);
    const to = nodeIndexOf(indexById, edge.toNodeId);
    const childBornAt = packedValueAt(nodes.bornAt, to);
    edges.from[cursor] = from;
    edges.to[cursor] = to;
    edges.mode[cursor] = packedGraphModeCode[edge.mode];
    edges.channel[cursor] = packedGraphEdgeChannelCode[edge.channel];
    edges.confidence[cursor] = edge.confidence;
    edges.bornAt[cursor] = childBornAt;
    edges.terminated[cursor] = edge.terminated ? 1 : 0;
    cursor += 1;
    if (childBornAt < packedValueAt(nodes.settleAt, from)) {
      nodes.settleAt[from] = childBornAt;
      nodesFrom = Math.min(nodesFrom, from);
    }
  }
  return nodesFrom;
}

const emptyNodeColumns: PackedGraphNodeColumns = {
  ids: [],
  labels: [],
  turn: new Uint16Array(0),
  role: new Uint8Array(0),
  mode: new Uint8Array(0),
  glyph: new Uint8Array(0),
  emphasis: new Uint8Array(0),
  detail: new Uint8Array(0),
  terminal: new Uint8Array(0),
  lane: new Float32Array(0),
  row: new Uint16Array(0),
  bornAt: new Float32Array(0),
  settleAt: new Float32Array(0),
  terminalAt: new Float32Array(0),
  labelPlacement: new Uint8Array(0),
  labelTruncated: new Uint8Array(0),
};

const emptyEdgeColumns: PackedGraphEdgeColumns = {
  from: new Uint32Array(0),
  to: new Uint32Array(0),
  mode: new Uint8Array(0),
  channel: new Uint8Array(0),
  confidence: new Float32Array(0),
  bornAt: new Float32Array(0),
  terminated: new Uint8Array(0),
};

const emptyTurnColumns: PackedGraphTurnColumns = {
  column: new Uint16Array(0),
  columnTop: new Float32Array(0),
  inputNode: new Uint32Array(0),
  outcomeNode: new Int32Array(0),
  rowSpan: new Uint16Array(0),
  outcome: new Uint8Array(0),
  answerAt: new Float32Array(0),
  compactAt: new Float32Array(0),
};

/** The snapshot a workstream shows before its first committed fact arrives. */
export function emptyPackedGraphSnapshot(workstreamId: string): PackedGraphSnapshot {
  return Object.freeze({
    workstreamId,
    cursorSequence: 0,
    hasEarlier: false,
    nodeCount: 0,
    edgeCount: 0,
    turnCount: 0,
    changed: Object.freeze({ nodesFrom: 0, edgesFrom: 0, turnsFrom: 0 }),
    nodes: emptyNodeColumns,
    edges: emptyEdgeColumns,
    turns: emptyTurnColumns,
    turnWorkstreamIds: [],
    nodeIndexById: new Map<string, number>(),
  });
}

function turnCountAfter(previous: PackedGraphSnapshot, batch: PackedGraphBatch): number {
  let count = previous.turnCount;
  for (const turn of batch.turns) {
    count = Math.max(count, turn.index + 1);
  }
  return count;
}

/**
 * Applies one pushed batch and returns a new immutable snapshot. The previous
 * snapshot keeps its own columns, so a renderer holding it can finish a frame
 * while the next one is being built.
 */
export function extendPackedGraphSnapshot(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
): PackedGraphSnapshot {
  validatePackedGraphBatch(previous, batch);
  const nodeCount = previous.nodeCount + batch.nodes.length;
  const edgeCount = previous.edgeCount + batch.edges.length;
  const turnCount = turnCountAfter(previous, batch);

  const nodes = grownNodeColumns(previous.nodes, previous.nodeCount, nodeCount);
  const indexById = new Map(previous.nodeIndexById);
  batch.nodes.forEach((node, offset) => {
    const index = previous.nodeCount + offset;
    writeNode(nodes, index, node);
    indexById.set(node.id, index);
  });

  const edges = grownEdgeColumns(previous.edges, previous.edgeCount, edgeCount);
  const settledFrom = writeEdges(
    { nodes, edges, indexById, firstEdge: previous.edgeCount },
    batch.edges,
  );

  const turns = grownTurnColumns(previous.turns, previous.turnCount, turnCount);
  const turnWorkstreamIds = previous.turnWorkstreamIds.slice(0, previous.turnCount);
  let turnsFrom = turnCount;
  for (const turn of batch.turns) {
    writeTurn(turns, indexById, turn);
    turnWorkstreamIds[turn.index] = turn.workstreamId;
    turnsFrom = Math.min(turnsFrom, turn.index);
  }

  const appendedFrom = batch.nodes.length > 0 ? previous.nodeCount : nodeCount;
  return Object.freeze({
    workstreamId: previous.workstreamId,
    cursorSequence: batch.cursorSequence,
    hasEarlier: batch.hasEarlier,
    nodeCount,
    edgeCount,
    turnCount,
    changed: Object.freeze({
      nodesFrom: Math.min(settledFrom, appendedFrom),
      edgesFrom: batch.edges.length > 0 ? previous.edgeCount : edgeCount,
      turnsFrom,
    }),
    nodes,
    edges,
    turns,
    turnWorkstreamIds,
    nodeIndexById: indexById,
  });
}

/**
 * Applies an ordered batch stream to a workstream's empty snapshot. A live
 * push applies the same batches as they arrive; replaying them from a durable
 * cursor must reach the same columns.
 */
export function buildPackedGraphSnapshot(
  workstreamId: string,
  batches: readonly PackedGraphBatch[],
): PackedGraphSnapshot {
  let snapshot = emptyPackedGraphSnapshot(workstreamId);
  for (const batch of batches) {
    snapshot = extendPackedGraphSnapshot(snapshot, batch);
  }
  return snapshot;
}
