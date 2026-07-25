/**
 * Placement for the floating label layer.
 *
 * Labels are DOM over the canvas, not canvas text: the checklist requires them
 * to be between the canvas and the rails, pointer-transparent except on the
 * outcome pill, and accessible. This module decides *where* and *how visible*
 * each label is; `graph-label-layer` does the DOM writes.
 *
 * Text density decays with distance from the live edge, so a long trajectory
 * stays legible instead of turning into a wall of overlapping sentences. The
 * question driving the current work sticks to the top of the viewport while its
 * turn is open, and an outcome pill sits over a success and below a failure so
 * the eclipsed node stays visible.
 */

import { graphFitFrame, graphWarpToScreen, type GraphFitFrame } from "./graph-visual-language";
import {
  graphNodeCssDiameter,
  graphNodeScreenPosition,
  type GraphViewport,
} from "./graph-view-state";
import {
  packedGraphLabelPlacementCode,
  packedGraphRoleCode,
  packedValueAt,
} from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

/** Distance behind the live edge over which a step label fades out. */
const fadeSpan = 0.42;
/** Where the active turn's question sticks, in CSS pixels from the top. */
const stickyTopPx = 58;
/** Gap between a node's edge and a label placed below it. */
const belowGapPx = 13;
/** An outcome pill waits this long after its node is born before appearing. */
const outcomeRevealSeconds = 0.9;
/** Turn openness under which a question and its rows stop being drawn. */
const foldedLabelCutoff = 0.35;

type GraphLabelAnchor = "below" | "over";

export interface GraphLabelPlacement {
  nodeIndex: number;
  x: number;
  y: number;
  opacity: number;
  anchor: GraphLabelAnchor;
  sticky: boolean;
  /** Both question and outcome pills fold this turn when activated. */
  expanded: boolean;
}

export interface GraphLabelScene {
  readonly snapshot: PackedGraphSnapshot;
  readonly worldY: Float32Array;
  readonly open: Float32Array;
  readonly cameraWorldY: number;
  readonly timeSeconds: number;
  readonly viewport: GraphViewport;
  readonly hoveredNode: number | null;
  /** Node index range worth considering; the same slice the GPU draws. */
  readonly visibleFrom: number;
  readonly visibleTo: number;
  /** The turn whose question sticks to the top of the viewport. */
  readonly activeTurn: number;
  readonly reducedMotion: boolean;
}

function labelOpacity(scene: GraphLabelScene, index: number, worldY: number): number {
  if (scene.hoveredNode === index) {
    return 1;
  }
  return Math.max(0, Math.min(1, 1 - (scene.cameraWorldY - worldY) / fadeSpan));
}

interface LabelCandidate {
  readonly bornAt: number;
  readonly worldY: number;
  readonly opacity: number;
  readonly anchor: GraphLabelAnchor;
  readonly isQuestion: boolean;
}

/**
 * An outcome pill waits for its node's arrival effects to finish; every other
 * label disappears with its turn once the ladder folds.
 */
function labelReady(
  scene: GraphLabelScene,
  index: number,
  bornAt: number,
  isOutcome: boolean,
): boolean {
  if (isOutcome) {
    return scene.reducedMotion || bornAt + outcomeRevealSeconds <= scene.timeSeconds;
  }
  return packedValueAt(scene.open, index) >= foldedLabelCutoff;
}

/**
 * Decides whether a node has a label worth drawing at all, and how strongly.
 * A compacted row carries no label text, a folded row's text is gone with its
 * turn, and an outcome pill waits for its node's arrival effects to finish.
 */
function labelCandidate(scene: GraphLabelScene, index: number): LabelCandidate | null {
  const anchorCode = packedValueAt(scene.snapshot.nodes.labelPlacement, index);
  if (anchorCode === packedGraphLabelPlacementCode.none) {
    return null;
  }
  const bornAt = packedValueAt(scene.snapshot.nodes.bornAt, index);
  if (bornAt > scene.timeSeconds) {
    return null;
  }
  const role = packedValueAt(scene.snapshot.nodes.role, index);
  const isOutcome = role === packedGraphRoleCode.outcome;
  if (!labelReady(scene, index, bornAt, isOutcome)) {
    return null;
  }
  const worldY = packedValueAt(scene.worldY, index);
  const isQuestion = role === packedGraphRoleCode.input;
  const opacity = isQuestion ? 1 : labelOpacity(scene, index, worldY);
  if (opacity < 0.02) {
    return null;
  }
  return {
    bornAt,
    worldY,
    opacity,
    anchor: anchorCode === packedGraphLabelPlacementCode.over ? "over" : "below",
    isQuestion,
  };
}

function placementFor(
  scene: GraphLabelScene,
  index: number,
  fit: GraphFitFrame,
  target: GraphLabelPlacement,
): boolean {
  const candidate = labelCandidate(scene, index);
  if (candidate === null) {
    return false;
  }
  const { bornAt, worldY, opacity, anchor, isQuestion } = candidate;
  const position = graphNodeScreenPosition(
    packedValueAt(scene.snapshot.nodes.lane, index),
    worldY,
    scene.cameraWorldY,
    fit,
    scene.viewport,
  );
  if (position.y < -70 || position.y > scene.viewport.height + 100) {
    return false;
  }
  const warped = graphWarpToScreen(
    position.x,
    position.y,
    scene.viewport.width,
    scene.viewport.height,
  );
  target.nodeIndex = index;
  target.x = warped.x;
  target.opacity = opacity;
  target.anchor = anchor;
  target.sticky = false;
  const turn = packedValueAt(scene.snapshot.nodes.turn, index);
  const input = packedValueAt(scene.snapshot.turns.inputNode, turn);
  target.expanded = packedValueAt(scene.open, input) >= 0.5;
  if (anchor === "over") {
    target.y = warped.y;
    return true;
  }
  const working =
    !scene.reducedMotion &&
    scene.timeSeconds < packedValueAt(scene.snapshot.nodes.settleAt, index) &&
    scene.timeSeconds >= bornAt;
  const diameter = graphNodeCssDiameter(worldY, scene.cameraWorldY, working, fit);
  const below = warped.y + diameter * 0.5 + belowGapPx;
  const sticky =
    isQuestion &&
    packedValueAt(scene.snapshot.nodes.turn, index) === scene.activeTurn &&
    below < stickyTopPx;
  target.y = sticky ? stickyTopPx : below;
  target.sticky = sticky;
  return true;
}

function emptyPlacement(): GraphLabelPlacement {
  return {
    nodeIndex: -1,
    x: 0,
    y: 0,
    opacity: 0,
    anchor: "below",
    sticky: false,
    expanded: false,
  };
}

/**
 * Fills `out` with the labels worth drawing this frame and returns how many.
 * The array is reused across frames so a label pass allocates nothing.
 */
export function computeGraphLabelPlacements(
  scene: GraphLabelScene,
  out: GraphLabelPlacement[],
): number {
  const fit = graphFitFrame(scene.viewport.width, scene.viewport.height);
  let count = 0;
  for (let index = scene.visibleFrom; index < scene.visibleTo; index += 1) {
    let target = out[count];
    if (target === undefined) {
      target = emptyPlacement();
      out.push(target);
    }
    if (placementFor(scene, index, fit, target)) {
      count += 1;
    }
  }
  return count;
}

/** The turn whose question sticks: the newest one that has started. */
export function graphActiveTurn(snapshot: PackedGraphSnapshot, timeSeconds: number): number {
  for (let turn = snapshot.turnCount - 1; turn >= 0; turn -= 1) {
    const input = packedValueAt(snapshot.turns.inputNode, turn);
    if (input < snapshot.nodeCount && packedValueAt(snapshot.nodes.bornAt, input) <= timeSeconds) {
      return turn;
    }
  }
  return -1;
}
