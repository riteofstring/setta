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

import {
  packedGraphDetailCode,
  packedGraphEdgeChannelCode,
  packedGraphEmphasisCode,
  packedGraphGlyphCode,
  packedGraphLabelPlacementCode,
  packedGraphLimits,
  packedGraphModeCode,
  packedGraphOutcomeCode,
  packedGraphOutcomes,
  packedGraphRoleCode,
  packedValueAt,
} from "./packed-graph-vocabulary";
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

function requireVocabularyValue(table: object, value: string, label: string): void {
  requireTrue(
    Object.prototype.hasOwnProperty.call(table, value),
    `${label} has unsupported value ${JSON.stringify(value)}`,
  );
}

interface BatchNodeView {
  readonly count: number;
  indexOf(nodeId: string): number;
  id(index: number): string;
  role(index: number): number;
  turn(index: number): number;
  row(index: number): number;
  bornAt(index: number): number;
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
    id: (index) => {
      const node = appended(index);
      const id = node === undefined ? previous.nodes.ids[index] : node.id;
      requireTrue(id !== undefined, `packed graph node index ${index} has no id`);
      return id ?? "";
    },
    role: (index) => {
      const node = appended(index);
      if (node === undefined) {
        return packedValueAt(previous.nodes.role, index);
      }
      return packedGraphRoleCode[node.role];
    },
    turn: (index) => {
      const node = appended(index);
      return node === undefined ? packedValueAt(previous.nodes.turn, index) : node.turn;
    },
    row: (index) => {
      const node = appended(index);
      return node === undefined ? packedValueAt(previous.nodes.row, index) : node.row;
    },
    bornAt: (index) => {
      const node = appended(index);
      return node === undefined ? packedValueAt(previous.nodes.bornAt, index) : node.bornAt;
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
  requireTrue(
    typeof node.id === "string" && node.id.trim().length > 0 && node.id.trim() === node.id,
    "packed graph node id must be non-empty without surrounding whitespace",
  );
  requireVocabularyValue(packedGraphRoleCode, node.role, `${label} role`);
  requireVocabularyValue(packedGraphModeCode, node.mode, `${label} mode`);
  requireVocabularyValue(packedGraphGlyphCode, node.glyph, `${label} glyph`);
  requireVocabularyValue(packedGraphEmphasisCode, node.emphasis, `${label} emphasis`);
  requireVocabularyValue(packedGraphDetailCode, node.detail, `${label} detail`);
  requireVocabularyValue(
    packedGraphLabelPlacementCode,
    node.labelPlacement,
    `${label} label placement`,
  );
  requireTrue(typeof node.label === "string", `${label} label must be a string`);
  requireIntegerInRange(node.turn, packedGraphLimits.maxTurns, `${label} turn`);
  requireIntegerInRange(node.row, packedGraphLimits.maxRowsPerTurn, `${label} row`);
  requireTrue(
    node.role === "input" ? node.row === 0 : node.row > 0,
    `${label} role ${node.role} cannot occupy row ${node.row}`,
  );
  requireFinite(node.lane, `${label} lane`);
  requireFinite(node.bornAt, `${label} bornAt`);
  requireFinite(node.settleAt, `${label} settleAt`);
  if (node.terminalAt !== null) {
    requireFinite(node.terminalAt, `${label} terminalAt`);
  }
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
  let lastBorn =
    previous.nodeCount === 0
      ? Number.NEGATIVE_INFINITY
      : packedValueAt(previous.nodes.bornAt, previous.nodeCount - 1);
  let lastTurn =
    previous.nodeCount === 0
      ? Number.NEGATIVE_INFINITY
      : packedValueAt(previous.nodes.turn, previous.nodeCount - 1);
  for (const node of batch.nodes) {
    requireTrue(
      node.bornAt >= lastBorn,
      `packed graph node ${node.id} is born at ${node.bornAt}, before the previous node at ${lastBorn}`,
    );
    requireTrue(
      node.turn >= lastTurn,
      `packed graph node ${node.id} returns to turn ${node.turn} after turn ${lastTurn}`,
    );
    lastBorn = node.bornAt;
    lastTurn = node.turn;
  }
}

function validateTurnShape(turn: PackedGraphTurnInput): void {
  const label = `packed graph turn ${turn.index}`;
  requireIntegerInRange(turn.index, packedGraphLimits.maxTurns, `${label} index`);
  requireVocabularyValue(packedGraphOutcomeCode, turn.outcome, `${label} outcome`);
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
  if (turn.answerAt !== null) {
    requireFinite(turn.answerAt, `${label} answerAt`);
  }
  if (turn.compactAt !== null) {
    requireFinite(turn.compactAt, `${label} compactAt`);
  }
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
  requireTrue(
    view.turn(input) === turn.index,
    `${label} input node ${turn.inputNodeId} belongs to turn ${view.turn(input)}`,
  );
  requireTrue(view.row(input) === 0, `${label} input node ${turn.inputNodeId} is not on row 0`);
  if (turn.outcomeNodeId === null) {
    return;
  }
  const outcome = view.indexOf(turn.outcomeNodeId);
  requireTrue(
    view.role(outcome) === packedGraphRoleCode.outcome,
    `${label} outcome node ${turn.outcomeNodeId} is not an outcome node`,
  );
  requireTrue(
    view.turn(outcome) === turn.index,
    `${label} outcome node ${turn.outcomeNodeId} belongs to turn ${view.turn(outcome)}`,
  );
  requireTrue(
    turn.answerAt !== null && turn.answerAt >= view.bornAt(outcome),
    `${label} answer time ${turn.answerAt} precedes outcome node ${turn.outcomeNodeId}`,
  );
}

function nullablePackedTime(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function validateExistingTurnUpdate(
  previous: PackedGraphSnapshot,
  turn: PackedGraphTurnInput,
  view: BatchNodeView,
): void {
  if (turn.index >= previous.turnCount) {
    return;
  }
  const label = `packed graph turn ${turn.index}`;
  const previousInput = packedValueAt(previous.turns.inputNode, turn.index);
  requireTrue(
    turn.inputNodeId === view.id(previousInput),
    `${label} changes its input node from ${view.id(previousInput)} to ${turn.inputNodeId}`,
  );
  const previousRowSpan = packedValueAt(previous.turns.rowSpan, turn.index);
  requireTrue(
    turn.rowSpan >= previousRowSpan,
    `${label} row span regresses from ${previousRowSpan} to ${turn.rowSpan}`,
  );
  const previousOutcomeCode = packedValueAt(previous.turns.outcome, turn.index);
  const previousOutcome = packedGraphOutcomes[previousOutcomeCode];
  requireTrue(previousOutcome !== undefined, `${label} has unknown prior outcome code`);
  if (previousOutcome === "running") {
    return;
  }
  const previousOutcomeNode = packedValueAt(previous.turns.outcomeNode, turn.index);
  const previousAnswerAt = nullablePackedTime(packedValueAt(previous.turns.answerAt, turn.index));
  const previousCompactAt = nullablePackedTime(packedValueAt(previous.turns.compactAt, turn.index));
  requireTrue(
    turn.outcome === previousOutcome &&
      turn.outcomeNodeId === view.id(previousOutcomeNode) &&
      (turn.answerAt === null ? null : Math.fround(turn.answerAt)) === previousAnswerAt &&
      (turn.compactAt === null ? null : Math.fround(turn.compactAt)) === previousCompactAt,
    `${label} changes after reaching terminal outcome ${previousOutcome}`,
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
    validateExistingTurnUpdate(previous, turn, view);
    rowSpans.set(turn.index, turn.rowSpan);
    lowestAllowed = turn.index + 1;
    nextNew = Math.max(nextNew, turn.index + 1);
  }
  return rowSpans;
}

function validateNodePlacement(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
  rowSpans: ReadonlyMap<number, number>,
): void {
  const updatedTurns = new Map(batch.turns.map((turn) => [turn.index, turn]));
  for (const node of batch.nodes) {
    validatePlacedNode(previous, node, rowSpans, updatedTurns.get(node.turn));
  }
}

function validatePlacedNode(
  previous: PackedGraphSnapshot,
  node: PackedGraphNodeInput,
  rowSpans: ReadonlyMap<number, number>,
  updated: PackedGraphTurnInput | undefined,
): void {
  if (
    node.turn < previous.turnCount &&
    packedValueAt(previous.turns.outcome, node.turn) !== packedGraphOutcomeCode.running
  ) {
    throw new Error(`packed graph node ${node.id} appends to terminal turn ${node.turn}`);
  }
  const rowSpan = rowSpans.get(node.turn);
  requireTrue(
    rowSpan !== undefined,
    `packed graph node ${node.id} names turn ${node.turn}, which no batch has created`,
  );
  requireTrue(
    node.row < (rowSpan ?? 0),
    `packed graph node ${node.id} sits at row ${node.row}, outside its turn's ${rowSpan} rows`,
  );
  if (node.role === "input") {
    requireTrue(
      node.id === placedInputNodeId(previous, node.turn, updated),
      `packed graph input node ${node.id} is not turn ${node.turn}'s input`,
    );
  }
  if (node.role === "outcome") {
    requireTrue(
      node.id === placedOutcomeNodeId(previous, node.turn, updated),
      `packed graph outcome node ${node.id} is not turn ${node.turn}'s outcome`,
    );
  }
}

function placedInputNodeId(
  previous: PackedGraphSnapshot,
  turn: number,
  updated: PackedGraphTurnInput | undefined,
): string | undefined {
  const previousInputNodeId =
    turn < previous.turnCount
      ? previous.nodes.ids[packedValueAt(previous.turns.inputNode, turn)]
      : undefined;
  return updated?.inputNodeId ?? previousInputNodeId;
}

function placedOutcomeNodeId(
  previous: PackedGraphSnapshot,
  turn: number,
  updated: PackedGraphTurnInput | undefined,
): string | null | undefined {
  const previousOutcome =
    turn < previous.turnCount ? packedValueAt(previous.turns.outcomeNode, turn) : -1;
  const previousOutcomeNodeId = previousOutcome < 0 ? null : previous.nodes.ids[previousOutcome];
  return updated?.outcomeNodeId ?? previousOutcomeNodeId;
}

function validateEdge(edge: PackedGraphEdgeInput, view: BatchNodeView): void {
  const label = `packed graph edge ${edge.fromNodeId} -> ${edge.toNodeId}`;
  requireVocabularyValue(packedGraphModeCode, edge.mode, `${label} mode`);
  requireVocabularyValue(packedGraphEdgeChannelCode, edge.channel, `${label} channel`);
  requireTrue(typeof edge.terminated === "boolean", `${label} terminated must be a boolean`);
  const from = view.indexOf(edge.fromNodeId);
  const to = view.indexOf(edge.toNodeId);
  requireTrue(from < to, `${label} runs backwards through durable order (${from} -> ${to})`);
  requireTrue(!view.isTerminal(from), `${label} continues from a terminated branch`);
  requireTrue(
    edge.terminated === view.isTerminal(to),
    `${label} terminated flag does not match its child`,
  );
  requireFinite(edge.confidence, `${label} confidence`);
  requireTrue(
    edge.confidence >= 0 && edge.confidence <= 1,
    `${label} confidence ${edge.confidence} is outside 0..1`,
  );
}

function validateEdgeOrder(
  previous: PackedGraphSnapshot,
  batch: PackedGraphBatch,
  view: BatchNodeView,
): void {
  let lastTarget =
    previous.edgeCount === 0
      ? Number.NEGATIVE_INFINITY
      : packedValueAt(previous.edges.to, previous.edgeCount - 1);
  for (const edge of batch.edges) {
    const target = view.indexOf(edge.toNodeId);
    requireTrue(
      target >= lastTarget,
      `packed graph edge to ${edge.toNodeId} is out of target order after node ${lastTarget}`,
    );
    lastTarget = target;
  }
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
    Number.isInteger(batch.cursorSequence),
    `packed graph batch cursor ${batch.cursorSequence} must be an integer`,
  );
  requireTrue(
    batch.cursorSequence > previous.cursorSequence,
    `packed graph batch cursor ${batch.cursorSequence} does not advance past ${previous.cursorSequence}`,
  );
  requireTrue(
    typeof batch.hasEarlier === "boolean",
    "packed graph batch hasEarlier must be a boolean",
  );
  for (const node of batch.nodes) {
    validateNodeShape(node);
  }
  const view = createBatchNodeView(previous, batch);
  validateLimits(previous, batch, view);
  validateNodeOrder(previous, batch);
  const rowSpans = validateTurns(previous, batch, view);
  validateNodePlacement(previous, batch, rowSpans);
  validateEdgeOrder(previous, batch, view);
  for (const edge of batch.edges) {
    validateEdge(edge, view);
  }
}
