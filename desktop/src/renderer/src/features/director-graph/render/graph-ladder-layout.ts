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
  /*
   * Whether columns share a live edge.
   *
   * One camera looks at one depth, so columns left at their own depths hide
   * each other: a short conversation ends far above a long one and falls off
   * the top while the long one is being watched. Aligning their live edges puts
   * every column's newest fact on the same line, which is the row the camera is
   * already following. The grid does not do this — a tile's cell is where it
   * belongs — and a conversation has only one column to align.
   */
  readonly alignColumnsToLiveEdge: boolean;
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
  /*
   * The top of what has been drawn. The camera clamps to it, so the view can
   * scroll back to the first fact and no further — a fixed bound assumed
   * content began at zero, which stopped being true the moment a tile could be
   * placed in a cell above it.
   */
  readonly contentTopWorldY: number;
  /** How many columns the snapshot holds. One means worldY is monotonic. */
  readonly columnCount: number;
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
    if (input.alignColumnsToLiveEdge) {
      this.alignColumns(snapshot);
    }
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
      contentTopWorldY: this.computeContentTop(snapshot),
      columnCount: this.lastTurnPerColumn(snapshot).length,
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

  /**
   * Stacks turns from the first dirty one and writes their node positions.
   *
   * A turn follows the turn above it *in its own column*. One conversation is
   * one column and reads as a single run; a composition is several columns side
   * by side, each starting at the top of the view rather than below whatever
   * was packed before it.
   */
  private placeTurns(snapshot: PackedGraphSnapshot, firstTurn: number): void {
    for (let turn = firstTurn; turn < snapshot.turnCount; turn += 1) {
      const previous = this.previousTurnInColumn(snapshot, turn);
      const cursor =
        previous < 0
          ? packedValueAt(snapshot.turns.columnTop, turn)
          : this.turnBottom(snapshot, previous);
      this.turnTopY[turn] = cursor;
      this.placeTurnNodes(snapshot, turn, cursor);
    }
  }

  /**
   * The turn immediately above this one in the same column, or -1 when it is
   * that column's first. Turns of a column are contiguous, so a conversation —
   * where every turn shares one column — finds its predecessor in a single
   * step.
   */
  private previousTurnInColumn(snapshot: PackedGraphSnapshot, turn: number): number {
    const column = packedValueAt(snapshot.turns.column, turn);
    for (let candidate = turn - 1; candidate >= 0; candidate -= 1) {
      if (packedValueAt(snapshot.turns.column, candidate) === column) {
        return candidate;
      }
    }
    return -1;
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
   * The lowest committed fact on screen. It used to be enough to look at the
   * last turns, because a turn's top was always below the turn before it. With
   * columns that no longer holds — the deepest point can be at the bottom of
   * any of them — so this takes the lowest across the last turn of each.
   */
  private computeLiveEdge(snapshot: PackedGraphSnapshot, timeSeconds: number): number {
    let edge = Number.NEGATIVE_INFINITY;
    for (const turn of this.lastTurnPerColumn(snapshot)) {
      const first = packedValueAt(this.turnFirstNode, turn);
      if (first < 0) {
        continue;
      }
      const end = packedValueAt(this.turnNodeEnd, turn);
      for (let index = first; index < end; index += 1) {
        if (packedValueAt(snapshot.nodes.bornAt, index) > timeSeconds) {
          continue;
        }
        edge = Math.max(edge, packedValueAt(this.worldY, index));
      }
    }
    return edge > Number.NEGATIVE_INFINITY ? edge : 0;
  }

  /*
   * Shifts every column so their live edges line up.
   *
   * A column's own depth is set by how much history it has, which is not
   * something the reader chose to care about; what they are watching is the
   * newest fact in each. So each column moves by the difference between its
   * bottom and the deepest one, and nothing inside a column moves relative to
   * the rest of it.
   */
  private alignColumns(snapshot: PackedGraphSnapshot): void {
    const bottoms = new Map<number, number>();
    for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
      const column = packedValueAt(snapshot.turns.column, turn);
      const first = packedValueAt(this.turnFirstNode, turn);
      if (first < 0) {
        continue;
      }
      const end = packedValueAt(this.turnNodeEnd, turn);
      let bottom = bottoms.get(column) ?? Number.NEGATIVE_INFINITY;
      for (let index = first; index < end; index += 1) {
        bottom = Math.max(bottom, packedValueAt(this.worldY, index));
      }
      bottoms.set(column, bottom);
    }
    let deepest = Number.NEGATIVE_INFINITY;
    for (const bottom of bottoms.values()) {
      deepest = Math.max(deepest, bottom);
    }
    if (!Number.isFinite(deepest)) {
      return;
    }
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(snapshot.nodes.turn, index);
      const bottom = bottoms.get(packedValueAt(snapshot.turns.column, turn));
      if (bottom === undefined) {
        continue;
      }
      this.worldY[index] = packedValueAt(this.worldY, index) + (deepest - bottom);
    }
  }

  /** The highest placed node, which is as far back as the view can scroll. */
  private computeContentTop(snapshot: PackedGraphSnapshot): number {
    let top = Number.POSITIVE_INFINITY;
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      top = Math.min(top, packedValueAt(this.worldY, index));
    }
    return Number.isFinite(top) ? top : 0;
  }

  /**
   * The bottom turn of every column. Scanning turn indices is cheap; scanning
   * their nodes is not, which is why the callers below start from this rather
   * than from every turn in the graph.
   */
  private lastTurnPerColumn(snapshot: PackedGraphSnapshot): number[] {
    const last = new Map<number, number>();
    for (let turn = 0; turn < snapshot.turnCount; turn += 1) {
      last.set(packedValueAt(snapshot.turns.column, turn), turn);
    }
    return [...last.values()];
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
    // The bottom turn of each column, plus the one above it: those are the
    // turns still capable of moving. Taking the last two turns overall would
    // watch one column and let the others go quiet while they were still
    // animating.
    const recent = new Set<number>();
    for (const turn of this.lastTurnPerColumn(snapshot)) {
      recent.add(turn);
      const previous = this.previousTurnInColumn(snapshot, turn);
      if (previous >= 0) {
        recent.add(previous);
      }
    }
    for (const turn of recent) {
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
