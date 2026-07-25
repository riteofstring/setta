/**
 * Batch validation for the packed GPU render snapshot boundary.
 *
 * A packed snapshot is the last place a malformed graph can be caught before
 * it becomes pixels, so every rule here fails loudly and names the offending
 * record. The rules encode what the boundary promises the renderer:
 *
 * - columns follow durable event order, so an earlier cursor is a prefix
 * - every edge endpoint and turn reference resolves to a packed node
 * - a terminated branch produces no further children
 * - a turn is running exactly when it has no outcome node
 */

import { packedGraphLimits, packedGraphRoleCode, packedValueAt } from "./packed-graph-vocabulary";
import type {
  PackedGraphBatch,
  PackedGraphEdgeInput,
  PackedGraphNodeInput,
  PackedGraphSnapshot,
  PackedGraphTurnInput,
} from "./packed-graph-snapshot";

function requireTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function requireFinite(value: number, label: string): void {
  requireTrue(Number.isFinite(value), `${label} must be finite, got ${value}`);
}

function requireIntegerInRange(value: number, maxExclusive: number, label: string): void {
  requireTrue(Number.isInteger(value), `${label} must be an integer, got ${value}`);
  requireTrue(value >= 0, `${label} must not be negative, got ${value}`);
  requireTrue(value < maxExclusive, `${label} must be below ${maxExclusive}, got ${value}`);
}

interface BatchNodeView {
  readonly count: number;
  indexOf(nodeId: string): number;
  role(index: number): number;
  isTerminal(index: number): boolean;
}

function createBatchNodeView(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
): BatchNodeView {
  const indexById = new Map(previous.nodeIndexById);
  batch.nodes.forEach((node, offset) => {
    requireTrue(node.id.length > 0, "packed graph node id must not be empty");
    requireTrue(!indexById.has(node.id), `packed graph node id ${node.id} is already packed`);
    indexById.set(node.id, previous.nodeCount + offset);
  });
  const appended = (index: number): PackedGraphNodeInput | undefined =>
    batch.nodes[index - previous.nodeCount];
  return {
    count: previous.nodeCount + batch.nodes.length,
    indexOf: (nodeId) => {
      const index = indexById.get(nodeId);
      requireTrue(index !== undefined, `packed graph batch references unknown node ${nodeId}`);
      return index ?? 0;
    },
    role: (index) => {
      const node = appended(index);
      if (node === undefined) {
        return packedValueAt(previous.nodes.role, index);
      }
      return packedGraphRoleCode[node.role];
    },
    isTerminal: (index) => {
      const node = appended(index);
      if (node === undefined) {
        return packedValueAt(previous.nodes.terminal, index) === 1;
      }
      return node.terminalAt !== null;
    },
  };
}

function validateNodeShape(node: PackedGraphNodeInput): void {
  const label = `packed graph node ${node.id}`;
  requireIntegerInRange(node.turn, packedGraphLimits.maxTurns, `${label} turn`);
  requireIntegerInRange(node.row, packedGraphLimits.maxRowsPerTurn, `${label} row`);
  requireFinite(node.lane, `${label} lane`);
  requireFinite(node.bornAt, `${label} bornAt`);
  requireTrue(node.bornAt >= 0, `${label} bornAt must not be negative`);
  requireTrue(
    node.settleAt >= node.bornAt,
    `${label} settleAt ${node.settleAt} precedes bornAt ${node.bornAt}`,
  );
  requireTrue(
    node.terminalAt === null || node.terminalAt >= node.bornAt,
    `${label} terminalAt ${node.terminalAt} precedes bornAt ${node.bornAt}`,
  );
}

/**
 * Column order is durable event order. Without this, a prefix of the columns
 * would not be the snapshot at an earlier cursor and replay could not be
 * compared against a live push.
 */
function validateNodeOrder(previous: PackedGraphSnapshot, batch: PackedGraphBatch): void {
  let last =
    previous.nodeCount === 0
      ? Number.NEGATIVE_INFINITY
      : packedValueAt(previous.nodes.bornAt, previous.nodeCount - 1);
  for (const node of batch.nodes) {
    requireTrue(
      node.bornAt >= last,
      `packed graph node ${node.id} is born at ${node.bornAt}, before the previous node at ${last}`,
    );
    last = node.bornAt;
  }
}

function validateTurnShape(turn: PackedGraphTurnInput): void {
  const label = `packed graph turn ${turn.index}`;
  requireIntegerInRange(turn.rowSpan, packedGraphLimits.maxRowsPerTurn + 1, `${label} rowSpan`);
  requireTrue(turn.rowSpan >= 1, `${label} rowSpan must cover its input row`);
  const running = turn.outcome === "running";
  requireTrue(
    running === (turn.outcomeNodeId === null),
    `${label} is ${turn.outcome} but ${running ? "names" : "names no"} an outcome node`,
  );
  requireTrue(
    running === (turn.answerAt === null),
    `${label} is ${turn.outcome} but ${running ? "carries" : "carries no"} an answer time`,
  );
  requireTrue(
    turn.compactAt === null || (turn.answerAt !== null && turn.compactAt >= turn.answerAt),
    `${label} folds at ${turn.compactAt} before it is answered`,
  );
}

function validateTurnReferences(turn: PackedGraphTurnInput, view: BatchNodeView): void {
  const label = `packed graph turn ${turn.index}`;
  const input = view.indexOf(turn.inputNodeId);
  requireTrue(
    view.role(input) === packedGraphRoleCode.input,
    `${label} input node ${turn.inputNodeId} is not an input node`,
  );
  if (turn.outcomeNodeId === null) {
    return;
  }
  const outcome = view.indexOf(turn.outcomeNodeId);
  requireTrue(
    view.role(outcome) === packedGraphRoleCode.outcome,
    `${label} outcome node ${turn.outcomeNodeId} is not an outcome node`,
  );
}

/**
 * Turn records are created in order and may be updated in place afterwards,
 * which is how a running turn gains its outcome node. Returns the row span of
 * every turn the batch leaves behind.
 */
function validateTurns(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
  view: BatchNodeView,
): ReadonlyMap<number, number> {
  const rowSpans = new Map<number, number>();
  for (let index = 0; index < previous.turnCount; index += 1) {
    rowSpans.set(index, packedValueAt(previous.turns.rowSpan, index));
  }
  let lowestAllowed = 0;
  let nextNew = previous.turnCount;
  for (const turn of batch.turns) {
    requireTrue(
      turn.index >= lowestAllowed,
      `packed graph turn ${turn.index} is out of ascending order`,
    );
    requireTrue(
      turn.index <= nextNew,
      `packed graph turn ${turn.index} leaves a gap after turn ${nextNew - 1}`,
    );
    validateTurnShape(turn);
    validateTurnReferences(turn, view);
    rowSpans.set(turn.index, turn.rowSpan);
    lowestAllowed = turn.index + 1;
    nextNew = Math.max(nextNew, turn.index + 1);
  }
  return rowSpans;
}

function validateNodePlacement(
  batch: PackedGraphBatch,
  rowSpans: ReadonlyMap<number, number>,
): void {
  for (const node of batch.nodes) {
    const rowSpan = rowSpans.get(node.turn);
    requireTrue(
      rowSpan !== undefined,
      `packed graph node ${node.id} names turn ${node.turn}, which no batch has created`,
    );
    requireTrue(
      node.row < (rowSpan ?? 0),
      `packed graph node ${node.id} sits at row ${node.row}, outside its turn's ${rowSpan} rows`,
    );
  }
}

function validateEdge(edge: PackedGraphEdgeInput, view: BatchNodeView): void {
  const label = `packed graph edge ${edge.fromNodeId} -> ${edge.toNodeId}`;
  const from = view.indexOf(edge.fromNodeId);
  const to = view.indexOf(edge.toNodeId);
  requireTrue(from < to, `${label} runs backwards through durable order (${from} -> ${to})`);
  requireTrue(!view.isTerminal(from), `${label} continues from a terminated branch`);
  requireFinite(edge.confidence, `${label} confidence`);
  requireTrue(
    edge.confidence >= 0 && edge.confidence <= 1,
    `${label} confidence ${edge.confidence} is outside 0..1`,
  );
}

function validateLimits(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
  view: BatchNodeView,
): void {
  requireTrue(
    view.count <= packedGraphLimits.maxNodes,
    `packed graph exceeds ${packedGraphLimits.maxNodes} nodes`,
  );
  requireTrue(
    previous.edgeCount + batch.edges.length <= packedGraphLimits.maxEdges,
    `packed graph exceeds ${packedGraphLimits.maxEdges} edges`,
  );
}

/**
 * Validates one pushed batch against the snapshot it extends. Throws on the
 * first violation; the caller's previous snapshot is never touched.
 */
export function validatePackedGraphBatch(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
): void {
  requireTrue(
    batch.cursorSequence > previous.cursorSequence,
    `packed graph batch cursor ${batch.cursorSequence} does not advance past ${previous.cursorSequence}`,
  );
  const view = createBatchNodeView(previous, batch);
  validateLimits(previous, batch, view);
  for (const node of batch.nodes) {
    validateNodeShape(node);
  }
  validateNodeOrder(previous, batch);
  const rowSpans = validateTurns(previous, batch, view);
  validateNodePlacement(batch, rowSpans);
  for (const edge of batch.edges) {
    validateEdge(edge, view);
  }
}
