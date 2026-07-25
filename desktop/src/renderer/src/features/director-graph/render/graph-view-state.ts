/**
 * View state: camera, look-back, hover, selection, and manual fold pins.
 *
 * None of this is semantic truth. The plan and the fidelity checklist both draw
 * the line in the same place — "selection, hover, camera position, animation
 * phase, and expansion state are view state ... they must not write back into
 * semantic graph truth" — so this module reads the packed snapshot and never
 * produces anything the projector would have to accept back.
 *
 * Screen projection lives here too, because the label layer, the pointer hit
 * test, and the reticles must all land on the *warped* node the shader drew,
 * not on where an unwarped projection would put it.
 */

import {
  graphFitFrame,
  graphLiveEdgeClipY,
  graphNodeGeometry,
  graphWarpToScreen,
  type GraphFitFrame,
} from "./graph-visual-language";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

/** How far one wheel notch looks back, in reference clip units per pixel. */
const lookBackPerPixel = 0.0013;
/** Furthest the view may scroll past the first fact. */
const lookBackCeiling = -0.7;
/** Camera distance from the live edge that counts as detached. */
const detachEpsilon = 0.02;
/** Pointer radius for selecting a node, in CSS pixels. */
const selectRadiusPx = 44;
/** Extra radius around an outcome node's fold toggle. */
const outcomeRadiusPx = 16;

export interface GraphScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GraphViewport {
  readonly width: number;
  readonly height: number;
}

/** Where a node lands on screen, before the barrel warp. */
export function graphNodeScreenPosition(
  laneX: number,
  worldY: number,
  cameraWorldY: number,
  fit: GraphFitFrame,
  viewport: GraphViewport,
): GraphScreenPoint {
  const clipY = (graphLiveEdgeClipY + (cameraWorldY - worldY)) * fit.fitY;
  const clipX = laneX * fit.fitX;
  return {
    x: (clipX * 0.5 + 0.5) * viewport.width,
    y: (1 - (clipY * 0.5 + 0.5)) * viewport.height,
  };
}

/**
 * The node's drawn diameter in CSS pixels. It has to match the shader's size
 * curve, otherwise a label sits off the node it belongs to and a click misses
 * a node the user can plainly see.
 */
export function graphNodeCssDiameter(
  worldY: number,
  cameraWorldY: number,
  working: boolean,
  fit: GraphFitFrame,
): number {
  const recent = Math.exp(-Math.max(0, cameraWorldY - worldY) * graphNodeGeometry.recencyFalloff);
  const size =
    graphNodeGeometry.baseDiameter +
    recent * graphNodeGeometry.recentBonus +
    (working ? graphNodeGeometry.workingBonus : 0);
  return size * graphNodeGeometry.cssDiameterScale * fit.size;
}

export interface GraphPointerScene {
  readonly snapshot: PackedGraphSnapshot;
  readonly worldY: Float32Array;
  readonly open: Float32Array;
  readonly cameraWorldY: number;
  readonly timeSeconds: number;
  readonly viewport: GraphViewport;
}

interface GraphHit {
  readonly nodeIndex: number;
  readonly distancePx: number;
}

/** Pointer distance to a drawn node, or null when the node is not on screen. */
function pointerDistance(
  scene: GraphPointerScene,
  index: number,
  fit: GraphFitFrame,
  pointer: GraphScreenPoint,
): number | null {
  if (packedValueAt(scene.snapshot.nodes.bornAt, index) > scene.timeSeconds) {
    return null;
  }
  if (packedValueAt(scene.open, index) < 0.2) {
    return null;
  }
  const position = graphNodeScreenPosition(
    packedValueAt(scene.snapshot.nodes.lane, index),
    packedValueAt(scene.worldY, index),
    scene.cameraWorldY,
    fit,
    scene.viewport,
  );
  if (position.y < -40 || position.y > scene.viewport.height + 40) {
    return null;
  }
  const warped = graphWarpToScreen(
    position.x,
    position.y,
    scene.viewport.width,
    scene.viewport.height,
  );
  return Math.hypot(warped.x - pointer.x, warped.y - pointer.y);
}

function hitTest(
  scene: GraphPointerScene,
  pointer: GraphScreenPoint,
  radiusPx: number,
  accept: (nodeIndex: number) => boolean,
): GraphHit | null {
  const fit = graphFitFrame(scene.viewport.width, scene.viewport.height);
  let best: GraphHit | null = null;
  for (let index = 0; index < scene.snapshot.nodeCount; index += 1) {
    if (!accept(index)) {
      continue;
    }
    const distance = pointerDistance(scene, index, fit, pointer);
    if (distance === null || distance > radiusPx) {
      continue;
    }
    if (best === null || distance < best.distancePx) {
      best = { nodeIndex: index, distancePx: distance };
    }
  }
  return best;
}

/** Nearest visible node to the pointer, for hover peek and selection. */
export function graphNodeAtPointer(
  scene: GraphPointerScene,
  pointer: GraphScreenPoint,
): number | null {
  return hitTest(scene, pointer, selectRadiusPx, () => true)?.nodeIndex ?? null;
}

/**
 * The outcome node under the pointer. Only an outcome node folds a turn, so a
 * stray click on the graph never collapses the trajectory the user is reading.
 */
export function graphOutcomeAtPointer(
  scene: GraphPointerScene,
  pointer: GraphScreenPoint,
): number | null {
  const fit = graphFitFrame(scene.viewport.width, scene.viewport.height);
  const hit = hitTest(
    scene,
    pointer,
    Number.POSITIVE_INFINITY,
    (index) => packedValueAt(scene.snapshot.nodes.role, index) === packedGraphRoleCode.outcome,
  );
  if (hit === null) {
    return null;
  }
  const diameter = graphNodeCssDiameter(
    packedValueAt(scene.worldY, hit.nodeIndex),
    scene.cameraWorldY,
    false,
    fit,
  );
  return hit.distancePx < diameter * 0.6 + outcomeRadiusPx ? hit.nodeIndex : null;
}

export interface GraphViewSnapshot {
  readonly cameraWorldY: number;
  readonly detached: boolean;
  readonly hoveredNode: number | null;
  readonly selectedNode: number | null;
  readonly pinnedTurns: ReadonlyMap<number, boolean>;
}

/**
 * Mutable view state for one workstream's canvas. It is a plain object rather
 * than a store because nothing outside the frame loop reads it: React state
 * must never change per frame, and the camera changes every frame.
 */
export class GraphViewController {
  private cameraWorldY = 0;
  private detached = false;
  private hoveredNode: number | null = null;
  private selectedNode: number | null = null;
  private readonly pinnedTurns = new Map<number, boolean>();

  snapshot(): GraphViewSnapshot {
    return {
      cameraWorldY: this.cameraWorldY,
      detached: this.detached,
      hoveredNode: this.hoveredNode,
      selectedNode: this.selectedNode,
      pinnedTurns: this.pinnedTurns,
    };
  }

  /** Resets everything a workstream switch must not carry across. */
  reset(): void {
    this.cameraWorldY = 0;
    this.detached = false;
    this.hoveredNode = null;
    this.selectedNode = null;
    this.pinnedTurns.clear();
  }

  camera(): number {
    return this.cameraWorldY;
  }

  isDetached(): boolean {
    return this.detached;
  }

  /** Follows the live edge unless the user has scrolled back to look. */
  followLiveEdge(cameraWorldY: number): void {
    if (this.detached) {
      return;
    }
    this.cameraWorldY = cameraWorldY;
  }

  /**
   * Wheel look-back. Scrolling back detaches the camera; scrolling forward to
   * the live edge reattaches it. Live work never stops, so there is nothing to
   * return to and no "back to live" control to hunt for.
   */
  lookBack(deltaYPx: number, liveEdgeWorldY: number): void {
    const next = Math.max(
      lookBackCeiling,
      Math.min(liveEdgeWorldY, this.cameraWorldY + deltaYPx * lookBackPerPixel),
    );
    this.cameraWorldY = next;
    this.detached = next < liveEdgeWorldY - detachEpsilon;
  }

  setHovered(nodeIndex: number | null): boolean {
    if (this.hoveredNode === nodeIndex) {
      return false;
    }
    this.hoveredNode = nodeIndex;
    return true;
  }

  /** Clicking the selected node again clears it. */
  toggleSelected(nodeIndex: number | null): void {
    this.selectedNode = nodeIndex === this.selectedNode ? null : nodeIndex;
  }

  hovered(): number | null {
    return this.hoveredNode;
  }

  selected(): number | null {
    return this.selectedNode;
  }

  /**
   * Pins a turn open or closed. The pin is explicit and reversible: it records
   * the opposite of what the turn is doing now, so one click always changes
   * something the user can see.
   */
  toggleTurnPin(turnIndex: number, currentlyOpen: boolean): void {
    this.pinnedTurns.set(turnIndex, !currentlyOpen);
  }

  pins(): ReadonlyMap<number, boolean> {
    return this.pinnedTurns;
  }
}

/**
 * Eases the hover flare. Hover is a continuous shader input rather than an
 * on/off, so a pointer crossing the graph does not strobe every node it passes.
 */
export function advanceHoverAmount(
  current: number,
  hovering: boolean,
  deltaSeconds: number,
  rate: number,
): number {
  const target = hovering ? 1 : 0;
  const next = current + (target - current) * Math.min(1, Math.max(0, deltaSeconds) * rate);
  return Math.abs(target - next) < 0.002 ? target : next;
}
