/**
 * Deterministic fixture generation at the packed GPU snapshot boundary.
 *
 * A scene compiles into the same ordered batch stream a live push would
 * deliver, so the renderer harness, the scale scenarios, and the burst
 * fixtures all drive the production boundary rather than a second, friendlier
 * one. Nothing here samples a clock or a random source: the same scene always
 * produces the same columns, which is what makes a frame-time comparison
 * between two builds meaningful.
 */

import {
  packedGraphModes,
  packedGraphGlyphs,
  packedValueAt,
  type PackedGraphEdgeChannel,
  type PackedGraphGlyph,
  type PackedGraphLabelPlacement,
  type PackedGraphMode,
  type PackedGraphOutcome,
} from "./packed-graph-vocabulary";
import {
  buildPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphEdgeInput,
  type PackedGraphNodeInput,
  type PackedGraphSnapshot,
  type PackedGraphTurnInput,
} from "./packed-graph-snapshot";
import {
  packedGraphScene,
  type FixtureItem,
  type FixtureLane,
  type FixtureStep,
  type FixtureTurn,
  type FixtureScene,
  type PackedGraphFixtureName,
} from "./packed-graph-scenes";

/** Seconds between committed facts in a fixture timeline. */
const fixtureTiming = {
  stepInterval: 1.1,
  laneStagger: 0.12,
  settleWindow: 1.54,
  terminalDelay: 1.1,
  answerDelay: 1.1,
  compactDelay: 2.4,
  turnGap: 2.2,
} as const;

/** Authored lane offsets in reference-frame clip units. */
const laneSpacing = 0.3;
const deadEndOffset = 0.3;

/** A risk-mode relationship draws a weaker beam than a settled one. */
const riskConfidence = 0.45;
const settledConfidence = 0.92;

interface OutcomeVisual {
  readonly mode: PackedGraphMode;
  readonly glyph: PackedGraphGlyph;
  readonly placement: PackedGraphLabelPlacement;
}

/**
 * Success sits over its node and the other terminals sit below, so the
 * eclipsed node stays visible. Cancellation reads amber rather than red: it
 * ended the work without failing at it.
 */
const outcomeVisuals = {
  succeeded: { mode: "success", glyph: "check", placement: "over" },
  failed: { mode: "fail", glyph: "cross", placement: "below" },
  cancelled: { mode: "risk", glyph: "warning", placement: "below" },
} satisfies Record<Exclude<PackedGraphOutcome, "running">, OutcomeVisual>;

interface CompilerState {
  readonly workstreamId: string;
  readonly hasEarlier: boolean;
  readonly batches: PackedGraphBatch[];
  turnIndex: number;
  clock: number;
  cursor: number;
  row: number;
  tip: string;
  inputId: string;
  nodeSeq: number;
  deadEndSide: number;
}

interface StepNodePlan {
  readonly id: string;
  readonly step: FixtureStep;
  readonly lane: number;
  readonly row: number;
  readonly bornAt: number;
  readonly terminalAt: number | null;
}

function requireAt<Value>(values: readonly Value[], index: number, label: string): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${label} index ${index} is out of range`);
  }
  return value;
}

function nextId(state: CompilerState): string {
  const id = `${state.workstreamId}-n${state.nodeSeq}`;
  state.nodeSeq += 1;
  return id;
}

function emitBatch(
  state: CompilerState,
  nodes: readonly PackedGraphNodeInput[],
  edges: readonly PackedGraphEdgeInput[],
  turn: PackedGraphTurnInput,
): void {
  state.cursor += nodes.length + edges.length;
  state.batches.push({
    cursorSequence: state.cursor,
    hasEarlier: state.hasEarlier,
    nodes,
    edges,
    turns: [turn],
  });
}

function runningTurn(state: CompilerState): PackedGraphTurnInput {
  return {
    index: state.turnIndex,
    column: 0,
    inputNodeId: state.inputId,
    outcomeNodeId: null,
    rowSpan: state.row,
    outcome: "running",
    answerAt: null,
    compactAt: null,
  };
}

/**
 * Compacted history keeps its glyph and its outcome text but drops step
 * labels, because old rows are read as shape rather than as sentences.
 */
function buildStepNode(state: CompilerState, plan: StepNodePlan): PackedGraphNodeInput {
  const detail = plan.step.detail ?? "detailed";
  const compacted = detail === "compacted";
  return {
    id: plan.id,
    turn: state.turnIndex,
    role: "step",
    mode: plan.step.mode,
    glyph: plan.step.glyph,
    emphasis: plan.step.emphasis ?? "fact",
    detail,
    lane: plan.lane,
    row: plan.row,
    bornAt: plan.bornAt,
    settleAt: plan.bornAt + fixtureTiming.settleWindow,
    terminalAt: plan.terminalAt,
    label: compacted ? "" : plan.step.text,
    labelPlacement: compacted ? "none" : "below",
  };
}

function edgeBetween(
  fromNodeId: string,
  toNodeId: string,
  mode: PackedGraphMode,
  channel: PackedGraphEdgeChannel,
  terminated: boolean,
): PackedGraphEdgeInput {
  return {
    fromNodeId,
    toNodeId,
    mode,
    channel,
    confidence: mode === "risk" ? riskConfidence : settledConfidence,
    terminated,
  };
}

function startTurn(state: CompilerState, turn: FixtureTurn): void {
  const id = nextId(state);
  state.inputId = id;
  state.tip = id;
  state.row = 1;
  emitBatch(
    state,
    [
      {
        id,
        turn: state.turnIndex,
        role: "input",
        mode: "listening",
        glyph: "microphone",
        emphasis: "fact",
        detail: turn.detail ?? "detailed",
        lane: 0,
        row: 0,
        bornAt: state.clock,
        settleAt: state.clock + fixtureTiming.settleWindow,
        terminalAt: null,
        label: turn.question,
        labelPlacement: "below",
      },
    ],
    [],
    runningTurn(state),
  );
}

function compileStep(state: CompilerState, step: FixtureStep): void {
  state.clock += fixtureTiming.stepInterval;
  const id = nextId(state);
  const node = buildStepNode(state, {
    id,
    step,
    lane: 0,
    row: state.row,
    bornAt: state.clock,
    terminalAt: null,
  });
  const edge = edgeBetween(state.tip, id, step.mode, "flow", false);
  state.row += 1;
  emitBatch(state, [node], [edge], runningTurn(state));
  state.tip = id;
}

/** A dead end leaves the spine, stops, and keeps its terminated edge. */
function compileDeadEnd(state: CompilerState, step: FixtureStep): void {
  state.clock += fixtureTiming.stepInterval;
  const id = nextId(state);
  const node = buildStepNode(state, {
    id,
    step,
    lane: deadEndOffset * state.deadEndSide,
    row: state.row,
    bornAt: state.clock,
    terminalAt: state.clock + fixtureTiming.terminalDelay,
  });
  const edge = edgeBetween(state.tip, id, step.mode, "branch", true);
  state.row += 1;
  state.deadEndSide *= -1;
  emitBatch(state, [node], [edge], runningTurn(state));
}

function laneOffsets(count: number): readonly number[] {
  if (count <= 1) {
    return [0];
  }
  const start = (-(count - 1) / 2) * laneSpacing;
  return Array.from({ length: count }, (_unused, index) => start + index * laneSpacing);
}

interface FanRowContext {
  readonly lanes: readonly FixtureLane[];
  readonly offsets: readonly number[];
  readonly parents: string[];
  readonly aliveTips: (string | null)[];
  readonly startRow: number;
  readonly startClock: number;
  readonly rowStep: number;
}

/**
 * One row of a fan arrives as a single batch: parallel work commits together,
 * which is the burst case the renderer has to coalesce.
 */
function emitFanRow(state: CompilerState, context: FanRowContext): void {
  const nodes: PackedGraphNodeInput[] = [];
  const edges: PackedGraphEdgeInput[] = [];
  context.lanes.forEach((lane, laneIndex) => {
    const step = lane.steps[context.rowStep];
    if (step === undefined) {
      return;
    }
    const last = context.rowStep === lane.steps.length - 1;
    const terminated = lane.terminated === true && last;
    const bornAt =
      context.startClock +
      (context.rowStep + 1) * fixtureTiming.stepInterval +
      laneIndex * fixtureTiming.laneStagger;
    const id = nextId(state);
    nodes.push(
      buildStepNode(state, {
        id,
        step,
        lane: packedValueAt(context.offsets, laneIndex),
        row: context.startRow + context.rowStep,
        bornAt,
        terminalAt: terminated ? bornAt + fixtureTiming.terminalDelay : null,
      }),
    );
    edges.push(
      edgeBetween(
        requireAt(context.parents, laneIndex, "fan lane parent"),
        id,
        step.mode,
        context.rowStep === 0 ? "branch" : "flow",
        terminated,
      ),
    );
    context.parents[laneIndex] = id;
    context.aliveTips[laneIndex] = terminated ? null : id;
  });
  state.row = context.startRow + context.rowStep + 1;
  emitBatch(state, nodes, edges, runningTurn(state));
}

function emitMerge(
  state: CompilerState,
  step: FixtureStep,
  aliveTips: readonly (string | null)[],
): void {
  state.clock += fixtureTiming.stepInterval;
  const id = nextId(state);
  const node = buildStepNode(state, {
    id,
    step,
    lane: 0,
    row: state.row,
    bornAt: state.clock,
    terminalAt: null,
  });
  const edges = aliveTips
    .filter((tip): tip is string => tip !== null)
    .map((tip) => edgeBetween(tip, id, "merge", "merge", false));
  state.row += 1;
  emitBatch(state, [node], edges, runningTurn(state));
  state.tip = id;
}

function compileFan(state: CompilerState, lanes: readonly FixtureLane[], merge: FixtureStep): void {
  const offsets = laneOffsets(lanes.length);
  const rows = Math.max(...lanes.map((lane) => lane.steps.length));
  const startRow = state.row;
  const startClock = state.clock;
  const parents = lanes.map(() => state.tip);
  const aliveTips: (string | null)[] = lanes.map(() => null);
  for (let rowStep = 0; rowStep < rows; rowStep += 1) {
    emitFanRow(state, {
      lanes,
      offsets,
      parents,
      aliveTips,
      startRow,
      startClock,
      rowStep,
    });
  }
  state.clock = startClock + rows * fixtureTiming.stepInterval;
  state.row = startRow + rows;
  emitMerge(state, merge, aliveTips);
}

function compileItem(state: CompilerState, item: FixtureItem): void {
  switch (item.kind) {
    case "step":
      compileStep(state, item.step);
      return;
    case "deadEnd":
      compileDeadEnd(state, item.step);
      return;
    case "fan":
      compileFan(state, item.lanes, item.merge);
      return;
    default: {
      const unreachable: never = item;
      throw new Error(`unsupported fixture item ${JSON.stringify(unreachable)}`);
    }
  }
}

function finishTurn(state: CompilerState, turn: FixtureTurn): void {
  if (turn.outcome === "running") {
    return;
  }
  if (turn.answer === undefined) {
    throw new Error(`fixture turn ${state.turnIndex} is ${turn.outcome} without an answer`);
  }
  state.clock += fixtureTiming.answerDelay;
  const visual = outcomeVisuals[turn.outcome];
  const id = nextId(state);
  const node: PackedGraphNodeInput = {
    id,
    turn: state.turnIndex,
    role: "outcome",
    mode: visual.mode,
    glyph: visual.glyph,
    emphasis: "fact",
    detail: turn.detail ?? "detailed",
    lane: 0,
    row: state.row,
    bornAt: state.clock,
    settleAt: state.clock + fixtureTiming.settleWindow,
    terminalAt: null,
    label: turn.answer,
    labelPlacement: visual.placement,
  };
  const edge = edgeBetween(state.tip, id, visual.mode, "flow", false);
  state.row += 1;
  emitBatch(state, [node], [edge], {
    index: state.turnIndex,
    column: 0,
    inputNodeId: state.inputId,
    outcomeNodeId: id,
    rowSpan: state.row,
    outcome: turn.outcome,
    answerAt: state.clock,
    compactAt: state.clock + fixtureTiming.compactDelay,
  });
  state.tip = id;
}

/** Compiles a scene into the ordered batch stream a live push would deliver. */
export function compilePackedGraphScene(scene: FixtureScene): readonly PackedGraphBatch[] {
  const state: CompilerState = {
    workstreamId: scene.workstreamId,
    hasEarlier: scene.hasEarlier,
    batches: [],
    turnIndex: 0,
    clock: 0,
    cursor: 0,
    row: 0,
    tip: "",
    inputId: "",
    nodeSeq: 0,
    deadEndSide: 1,
  };
  for (const turn of scene.turns) {
    startTurn(state, turn);
    for (const item of turn.items) {
      compileItem(state, item);
    }
    finishTurn(state, turn);
    state.turnIndex += 1;
    state.clock += fixtureTiming.turnGap;
  }
  return state.batches;
}

export function packedGraphFixtureBatches(
  name: PackedGraphFixtureName,
): readonly PackedGraphBatch[] {
  return compilePackedGraphScene(packedGraphScene(name));
}

export function packedGraphFixture(name: PackedGraphFixtureName): PackedGraphSnapshot {
  const scene = packedGraphScene(name);
  return buildPackedGraphSnapshot(scene.workstreamId, compilePackedGraphScene(scene));
}

export interface PackedGraphScaleOptions {
  readonly workstreamId: string;
  readonly turns: number;
  readonly stepsPerTurn: number;
  /** Parallel lanes per turn; 0 keeps the turn on the spine. */
  readonly lanes: number;
}

function scaleStep(index: number): FixtureStep {
  return {
    text: `scale step ${index}`,
    mode: requireAt(packedGraphModes, index % packedGraphModes.length, "mode"),
    glyph: requireAt(packedGraphGlyphs, index % packedGraphGlyphs.length, "glyph"),
  };
}

function scaleTurn(turnIndex: number, options: PackedGraphScaleOptions): FixtureTurn {
  const items: FixtureItem[] = [];
  for (let index = 0; index < options.stepsPerTurn; index += 1) {
    items.push({
      kind: "step",
      step: scaleStep(turnIndex * options.stepsPerTurn + index),
    });
  }
  if (options.lanes > 0) {
    items.push({
      kind: "fan",
      lanes: Array.from({ length: options.lanes }, (_unused, lane) => ({
        steps: [scaleStep(turnIndex + lane)],
      })),
      merge: { text: "merge lanes", mode: "merge", glyph: "synthesis" },
    });
  }
  return {
    question: `scale question ${turnIndex}`,
    items,
    outcome: "succeeded",
    answer: `scale answer ${turnIndex}`,
  };
}

/**
 * Builds a scene at an arbitrary size for the scale and viewport scenarios.
 * Shape stays fixed for a given set of options, so a measured run can be
 * compared against an earlier one.
 */
function packedGraphScaleScene(options: PackedGraphScaleOptions): FixtureScene {
  return {
    workstreamId: options.workstreamId,
    hasEarlier: options.turns > 1,
    turns: Array.from({ length: options.turns }, (_unused, turnIndex) =>
      scaleTurn(turnIndex, options),
    ),
  };
}

export function packedGraphScaleFixture(options: PackedGraphScaleOptions): PackedGraphSnapshot {
  const scene = packedGraphScaleScene(options);
  return buildPackedGraphSnapshot(scene.workstreamId, compilePackedGraphScene(scene));
}

/**
 * A set of distinct workstream snapshots for the navigation scenario. Each
 * workstream carries its own graph so switching selection is a snapshot swap,
 * never a rebuild of the others.
 */
export function packedGraphWorkstreamSet(count: number): readonly PackedGraphSnapshot[] {
  return Array.from({ length: count }, (_unused, index) =>
    packedGraphScaleFixture({
      workstreamId: `workstream-${index}`,
      turns: 1 + (index % 4),
      stepsPerTurn: 2 + (index % 3),
      lanes: index % 3 === 0 ? 3 : 0,
    }),
  );
}
