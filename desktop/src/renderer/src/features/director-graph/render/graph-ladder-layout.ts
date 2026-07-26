/**
 * Turn-ladder layout.
 *
 * A turn is an input node, its reasoning rows, and its outcome node. While the
 * turn is open the rows are spread down the spine; once the answer settles the
 * rows compress into the outcome node and the workstream reads as a compact
 * user/answer ladder (mockup `layout()`, lines 930–966).
 *
 * Two properties matter for the frame budget:
 *
 * 1. **Work is proportional to what moved, not to history.** A turn's position
 *    depends only on the turns above it, so a fold recomputes from the first
 *    animating turn downward and leaves everything above it untouched. When no
 *    turn is animating and nothing was appended, a pass writes nothing.
 * 2. **The output is a dirty range.** The renderer uploads `[dirtyFrom,
 *    dirtyTo)` of the node state texture rather than the whole buffer.
 *
 * This module holds no clock and no GL. It is given a time and a delta and
 * returns positions.
 */

import { graphLadderSpacing, graphMotionRates } from "./graph-visual-language";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

/** How long after a node settles the renderer still has motion to draw. */
const settleTailSeconds = 1.2;
/** How long after a turn folds the ladder is still easing into place. */
const foldTailSeconds = 1.4;
/** Openness closer than this to its target is snapped, ending the animation. */
const foldEpsilon = 0.0016;

export interface GraphLadderInput {
  /** Now, in the snapshot's committed-event time base. */
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  /** Turn index to manual fold pin. A pin overrides the automatic fold. */
  readonly pinnedTurns: ReadonlyMap<number, boolean>;
  readonly reducedMotion: boolean;
}

export interface GraphLadderFrame {
  readonly nodeCount: number;
  /** Per node, in reference-frame clip units, growing downward. */
  readonly worldY: Float32Array;
  /** Per node, 0..1. Reasoning rows fade as their turn folds; outcomes stay. */
  readonly open: Float32Array;
  readonly dirtyFrom: number;
  readonly dirtyTo: number;
  /** World position of the newest visible fact; the camera follows this. */
  readonly liveEdgeWorldY: number;
  /** A fold is still easing, so the next frame will differ from this one. */
  readonly foldAnimating: boolean;
  /**
   * The time after which nothing in the recent window animates on its own. The
   * frame scheduler sleeps once the clock passes it and no event has arrived.
   */
  readonly quietUntilSeconds: number;
}

/**
 * Capacity grows geometrically so an appended fact does not reallocate every
 * column it touches. A live workstream appends constantly; exact-fit growth
 * would put an allocation proportional to history on the push path.
 */
function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(64, current);
  while (capacity < required) {
    capacity *= 2;
  }
  return capacity;
}

function grownFloats(
  source: Float32Array<ArrayBuffer>,
  used: number,
  size: number,
): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(source.subarray(0, used));
  return next;
}

function grownInts(
  source: Int32Array<ArrayBuffer>,
  used: number,
  size: number,
  fill: number,
): Int32Array<ArrayBuffer> {
  const next = new Int32Array(size);
  next.fill(fill);
  next.set(source.subarray(0, used));
  return next;
}

export class GraphLadderLayout {
  private workstreamId = "";
  private syncedNodeCount = 0;
  private syncedTurnCount = 0;
  private worldY = new Float32Array(0);
  private open = new Float32Array(0);
  private openness = new Float32Array(0);
  private turnTopY = new Float32Array(0);
  private turnFirstNode = new Int32Array(0);
  private turnNodeEnd = new Int32Array(0);
  private lastLiveEdge = 0;
  /** Whether the next advance arrives at its resting state instead of easing. */
  private settleNextAdvance = false;

  /**
   * Advances fold animation and repositions everything below the first turn
   * that moved. Returns the node range the renderer must re-upload.
   *
   * The range starts at the first node of the first turn that moved, not at the
   * first node whose value actually differs. A turn is the unit that moves —
   * appending to it changes its span and shifts every turn below — so the range
   * is bounded by one turn plus what follows it, never by total history.
   */
  advance(snapshot: PackedGraphSnapshot, input: GraphLadderInput): GraphLadderFrame {
    this.reallocate(snapshot);
    const appendedFrom = this.syncedNodeCount;
    this.indexAppendedNodes(snapshot);
    // A settling frame takes every fold target at once, so the turns it moved
    // are dirty but none of them needs another frame.
    const settling = this.settleNextAdvance;
    this.settleNextAdvance = false;
    const firstAnimating = this.advanceOpenness(snapshot, input, settling);
    const firstDirtyTurn = Math.min(firstAnimating, this.firstTurnOf(appendedFrom, snapshot));
    const dirtyFrom =
      firstDirtyTurn >= snapshot.turnCount
        ? snapshot.nodeCount
        : Math.min(appendedFrom, packedValueAt(this.turnFirstNode, firstDirtyTurn));
    this.placeTurns(snapshot, firstDirtyTurn);
    this.syncedNodeCount = snapshot.nodeCount;
    this.syncedTurnCount = snapshot.turnCount;
    this.lastLiveEdge = this.computeLiveEdge(snapshot, input.timeSeconds);
    return {
      nodeCount: snapshot.nodeCount,
      worldY: this.worldY,
      open: this.open,
      dirtyFrom: Math.min(dirtyFrom, snapshot.nodeCount),
      dirtyTo: snapshot.nodeCount,
      liveEdgeWorldY: this.lastLiveEdge,
      foldAnimating: !settling && firstAnimating < snapshot.turnCount,
      quietUntilSeconds: this.quietUntil(snapshot, input),
    };
  }

  /** World position of one node, for hit-testing and the hover uniform. */
  nodeWorldY(index: number): number {
    return packedValueAt(this.worldY, index);
  }

  /**
   * How many nodes the last advance placed. It is 0 after a reset and until the
   * next frame runs, which is exactly the window in which the columns below
   * hold no position for a node the snapshot already has.
   */
  placedNodeCount(): number {
    return this.syncedNodeCount;
  }

  /** The live columns. Callers read them; only `advance` writes them. */
  worldYColumn(): Float32Array {
    return this.worldY;
  }

  openColumn(): Float32Array {
    return this.open;
  }

  /** The live edge from the last pass, for look-back clamping between frames. */
  liveEdge(): number {
    return this.lastLiveEdge;
  }

  /** Current fold state of a turn, for the pin toggle and label visibility. */
  turnOpenness(turnIndex: number): number {
    return packedValueAt(this.openness, turnIndex);
  }

  /**
   * Drops the incremental state.
   *
   * Turn ranges are only valid while each snapshot extends the one before it.
   * A *replacement* is not an extension even when the workstream id is
   * unchanged — a resync after `resync_required`, a cold replay after restart,
   * or a reloaded window all hand the same workstream a snapshot that starts
   * over — so the owner calls this whenever it replaces rather than extends.
   */
  reset(): void {
    this.clear("");
    this.settleNextAdvance = true;
  }

  private clear(workstreamId: string): void {
    this.workstreamId = workstreamId;
    this.syncedNodeCount = 0;
    this.syncedTurnCount = 0;
    this.lastLiveEdge = 0;
    this.worldY = new Float32Array(0);
    this.open = new Float32Array(0);
    this.openness = new Float32Array(0);
    this.turnTopY = new Float32Array(0);
    this.turnFirstNode = new Int32Array(0);
    this.turnNodeEnd = new Int32Array(0);
  }

  private reallocate(snapshot: PackedGraphSnapshot): void {
    if (snapshot.workstreamId !== this.workstreamId) {
      this.clear(snapshot.workstreamId);
    }
    if (this.worldY.length < snapshot.nodeCount) {
      const capacity = nextCapacity(this.worldY.length, snapshot.nodeCount);
      this.worldY = grownFloats(this.worldY, this.syncedNodeCount, capacity);
      this.open = grownFloats(this.open, this.syncedNodeCount, capacity);
    }
    if (this.openness.length < snapshot.turnCount) {
      const capacity = nextCapacity(this.openness.length, snapshot.turnCount);
      this.openness = grownFloats(this.openness, this.syncedTurnCount, capacity);
      this.turnTopY = grownFloats(this.turnTopY, this.syncedTurnCount, capacity);
      this.turnFirstNode = grownInts(this.turnFirstNode, this.syncedTurnCount, capacity, -1);
      this.turnNodeEnd = grownInts(this.turnNodeEnd, this.syncedTurnCount, capacity, 0);
    }
    // A turn arrives expanded and folds only when its own `compactAt` passes.
    this.openness.fill(1, this.syncedTurnCount, snapshot.turnCount);
  }

  /**
   * Records which nodes belong to which turn. Durable order commits a turn's
   * facts before the next turn opens, so a turn owns one contiguous node range;
   * a snapshot that breaks that would silently mislay rows, so it fails here.
   */
  private indexAppendedNodes(snapshot: PackedGraphSnapshot): void {
    for (let index = this.syncedNodeCount; index < snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(snapshot.nodes.turn, index);
      const first = packedValueAt(this.turnFirstNode, turn);
      if (first < 0) {
        this.turnFirstNode[turn] = index;
      } else if (packedValueAt(this.turnNodeEnd, turn) !== index) {
        throw new Error(
          `director graph turn ${turn} is not contiguous: node ${index} follows node ${
            packedValueAt(this.turnNodeEnd, turn) - 1
          }`,
        );
      }
      this.turnNodeEnd[turn] = index + 1;
    }
  }

  private firstTurnOf(nodeIndex: number, snapshot: PackedGraphSnapshot): number {
    if (nodeIndex >= snapshot.nodeCount) {
      return snapshot.turnCount;
    }
    return packedValueAt(snapshot.nodes.turn, nodeIndex);
  }

  /** Eases every turn toward its fold target and returns the first that moved. */
  /*
   * How far each turn moves toward its fold target this frame.
   *
   * A frame that follows a reset settles: every turn takes its target at once
   * rather than easing from zero. Easing is how a fold reads while the reader
   * is watching it happen; replaying it for a graph they have just arrived at
   * is showing them history they did not ask for, and on a long conversation
   * that is seconds of it.
   */
  private advanceOpenness(
    snapshot: PackedGraphSnapshot,
    input: GraphLadderInput,
    settling: boolean,
  ): number {
    const rate =
      settling || input.reducedMotion
        ? 1
        : Math.min(1, Math.max(0, input.deltaSeconds) * graphMotionRates.fold);
    let firstAnimating = snapshot.turnCount;
    for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
      const target = this.foldTarget(snapshot, turn, input);
      const current = packedValueAt(this.openness, turn);
      if (current === target) {
        continue;
      }
      const next = current + (target - current) * rate;
      this.openness[turn] = Math.abs(target - next) < foldEpsilon ? target : next;
      firstAnimating = Math.min(firstAnimating, turn);
    }
    return firstAnimating;
  }

  private foldTarget(snapshot: PackedGraphSnapshot, turn: number, input: GraphLadderInput): number {
    const pinned = input.pinnedTurns.get(turn);
    if (pinned !== undefined) {
      return pinned ? 1 : 0;
    }
    const compactAt = packedValueAt(snapshot.turns.compactAt, turn);
    if (input.reducedMotion && Number.isFinite(compactAt)) {
      return 0;
    }
    return input.timeSeconds > compactAt ? 0 : 1;
  }

  /** Stacks turns from the first dirty one and writes their node positions. */
  private placeTurns(snapshot: PackedGraphSnapshot, firstTurn: number): void {
    let cursor = firstTurn === 0 ? 0 : this.turnBottom(snapshot, firstTurn - 1);
    for (let turn = firstTurn; turn < snapshot.turnCount; turn += 1) {
      this.turnTopY[turn] = cursor;
      this.placeTurnNodes(snapshot, turn, cursor);
      cursor = this.turnBottom(snapshot, turn);
    }
  }

  private turnBottom(snapshot: PackedGraphSnapshot, turn: number): number {
    const openness = packedValueAt(this.openness, turn);
    const top = packedValueAt(this.turnTopY, turn);
    const gap =
      graphLadderSpacing.foldedGap +
      (graphLadderSpacing.openGap - graphLadderSpacing.foldedGap) * openness;
    return top + this.turnSpan(snapshot, turn) * openness + gap;
  }

  /** Local depth of a turn's lowest row when fully expanded. */
  private turnSpan(snapshot: PackedGraphSnapshot, turn: number): number {
    const outcome = packedValueAt(snapshot.turns.outcomeNode, turn);
    if (outcome >= 0) {
      return (
        packedValueAt(snapshot.nodes.row, outcome) * graphLadderSpacing.rowStep +
        graphLadderSpacing.outcomeGap
      );
    }
    const rowSpan = packedValueAt(snapshot.turns.rowSpan, turn);
    return Math.max(0, rowSpan - 1) * graphLadderSpacing.rowStep;
  }

  private placeTurnNodes(snapshot: PackedGraphSnapshot, turn: number, top: number): void {
    const first = packedValueAt(this.turnFirstNode, turn);
    if (first < 0) {
      return;
    }
    const end = packedValueAt(this.turnNodeEnd, turn);
    const openness = packedValueAt(this.openness, turn);
    for (let index = first; index < end; index += 1) {
      const role = packedValueAt(snapshot.nodes.role, index);
      const localY =
        packedValueAt(snapshot.nodes.row, index) * graphLadderSpacing.rowStep +
        (role === packedGraphRoleCode.outcome ? graphLadderSpacing.outcomeGap : 0);
      this.worldY[index] = top + localY * openness;
      this.open[index] = role === packedGraphRoleCode.outcome ? 1 : openness;
    }
  }

  /**
   * The newest committed fact that is on screen. Only the last turns can hold
   * it, because a turn's top is always below the turn before it.
   */
  private computeLiveEdge(snapshot: PackedGraphSnapshot, timeSeconds: number): number {
    for (let turn = snapshot.turnCount - 1; turn >= 0; turn -= 1) {
      const first = packedValueAt(this.turnFirstNode, turn);
      if (first < 0) {
        continue;
      }
      const end = packedValueAt(this.turnNodeEnd, turn);
      let edge = Number.NEGATIVE_INFINITY;
      for (let index = first; index < end; index += 1) {
        if (packedValueAt(snapshot.nodes.bornAt, index) > timeSeconds) {
          continue;
        }
        edge = Math.max(edge, packedValueAt(this.worldY, index));
      }
      if (edge > Number.NEGATIVE_INFINITY) {
        return edge;
      }
    }
    return 0;
  }

  /**
   * When the recent window stops moving by itself. Births, working envelopes,
   * and pending folds all extend it; once the clock passes it the scheduler can
   * sleep until the next pushed batch.
   */
  private quietUntil(snapshot: PackedGraphSnapshot, input: GraphLadderInput): number {
    if (input.reducedMotion) {
      return input.timeSeconds;
    }
    let quiet = input.timeSeconds;
    const firstTurn = Math.max(0, snapshot.turnCount - 2);
    for (let turn = firstTurn; turn < snapshot.turnCount; turn += 1) {
      const compactAt = packedValueAt(snapshot.turns.compactAt, turn);
      if (Number.isFinite(compactAt)) {
        quiet = Math.max(quiet, compactAt + foldTailSeconds);
      }
      const first = packedValueAt(this.turnFirstNode, turn);
      if (first < 0) {
        continue;
      }
      const end = packedValueAt(this.turnNodeEnd, turn);
      for (let index = first; index < end; index += 1) {
        const settleAt = packedValueAt(snapshot.nodes.settleAt, index);
        if (Number.isFinite(settleAt)) {
          quiet = Math.max(quiet, settleAt + settleTailSeconds);
        }
        quiet = Math.max(quiet, packedValueAt(snapshot.nodes.bornAt, index) + settleTailSeconds);
      }
    }
    return quiet;
  }
}

/**
 * Eases the camera onto the live edge. Detached look-back keeps its own offset,
 * which is why the caller owns the camera value and this only advances it.
 */
export function advanceGraphCamera(
  current: number,
  target: number,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) {
    return target;
  }
  const rate = Math.min(1, Math.max(0, deltaSeconds) * graphMotionRates.camera);
  const next = current + (target - current) * rate;
  return Math.abs(target - next) < 0.0004 ? target : next;
}
