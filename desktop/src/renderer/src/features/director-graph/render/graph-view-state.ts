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

import type { SemanticGraphPresentation } from "../semantic-graph-packer";
import {
  graphFitFrame,
  graphLiveEdgeClipY,
  graphNodeGeometry,
  graphReferenceFrame,
  graphWarpToScreen,
  type GraphFitFrame,
} from "./graph-visual-language";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

/** How far one wheel notch looks back, in reference clip units per pixel. */
const lookBackPerPixel = 0.0013;
/** Clip position used to keep an old conversation row barely on screen. */
const conversationVisibleClipLimit = 0.9;

export interface GraphWorldBounds {
  readonly top: number;
  readonly bottom: number;
}

/**
 * World offset that binds a supporting thread to the Director's own extent.
 *
 * The previous offset is the natural position for the next frame. It remains
 * unchanged while the thread can travel with the Director, then clamps only
 * when the next top or bottom edge reaches the matching Director anchor. This
 * gives direction changes release hysteresis without a second scroll state
 * machine. A new composition starts top-aligned. No viewport inset
 * participates, so resizing chrome cannot move either stop.
 */
export function graphDirectorBoundedThreadWorldOffset(
  threadBounds: GraphWorldBounds,
  directorBounds: GraphWorldBounds,
  cameraBounds: GraphCameraBounds,
  cameraWorldY: number,
  previousOffsetWorldY: number,
): number {
  if (threadBounds.bottom < threadBounds.top || directorBounds.bottom < directorBounds.top) {
    return 0;
  }
  const topAlignedOffset = directorBounds.top - threadBounds.top;
  const oldestCameraWorldY = Math.min(cameraBounds.oldestCameraWorldY, cameraBounds.liveEdgeWorldY);
  const directorTopAnchor = directorBounds.top - oldestCameraWorldY;
  const directorBottomAnchor = directorBounds.bottom - cameraBounds.liveEdgeWorldY;
  if (directorBottomAnchor < directorTopAnchor) {
    return topAlignedOffset;
  }
  const threadTop = threadBounds.top - cameraWorldY;
  const threadBottom = threadBounds.bottom - cameraWorldY;
  const threadSpan = threadBottom - threadTop;
  const directorSpan = directorBottomAnchor - directorTopAnchor;
  const lower =
    threadSpan <= directorSpan
      ? directorTopAnchor - threadTop
      : directorBottomAnchor - threadBottom;
  const upper =
    threadSpan <= directorSpan
      ? directorBottomAnchor - threadBottom
      : directorTopAnchor - threadTop;
  const preferredOffset = Number.isFinite(previousOffsetWorldY)
    ? previousOffsetWorldY
    : topAlignedOffset;
  return Math.max(lower, Math.min(upper, preferredOffset));
}

/**
 * Oldest camera position for the current presentation.
 *
 * An overview behaves like a bounded document: its Director first row mirrors
 * the live row around the viewport centre, giving both scroll stops the same
 * barrel-warped edge clearance. A single conversation preserves looser
 * look-back framing, where the first fact may travel toward the bottom before
 * the camera stops.
 */
export function graphOldestCameraWorldY(
  contentTopWorldY: number,
  fitY: number,
  presentation: SemanticGraphPresentation,
): number {
  if (!(fitY > 0)) {
    return contentTopWorldY;
  }
  if (presentation !== "conversation") {
    return contentTopWorldY - graphLiveEdgeClipY * 2;
  }
  const lookBackMargin = Math.max(0, graphLiveEdgeClipY + conversationVisibleClipLimit / fitY);
  return contentTopWorldY - lookBackMargin;
}
/** Camera distance from the live edge that counts as detached. */
const detachEpsilon = 0.02;
/** Maximum visual travel beyond a graph boundary, independent of viewport size. */
const elasticMaximumOffsetPx = 76;
/** Trackpad/wheel travel is resisted before it reaches the visual spring. */
const elasticInputResistance = 0.26;
/** Briefly hold the stretched position while a wheel gesture is still arriving. */
const elasticInputHoldSeconds = 0.06;
/** Slightly under-critical spring: one soft return, no repeated bounce. */
const elasticSpringStiffness = 150;
const elasticSpringDamping = 20;
const elasticStopOffsetPx = 0.08;
const elasticStopVelocityPxPerSecond = 2;
const elasticDisturbanceSpeedPxPerSecond = 150;
/** Pointer radius for selecting a node, in CSS pixels. */
const selectRadiusPx = 44;
/** Extra radius around an outcome node's fold toggle. */
const outcomeRadiusPx = 16;

export interface GraphScreenPoint {
  readonly x: number;
  readonly y: number;
}

/*
 * What activating a node does.
 *
 * A node can be activated from the canvas or from its label, which is a real
 * button and takes the click first. Both ask this, so the two routes cannot
 * answer differently — a pill that folds a turn while the canvas beneath it
 * opens a thread is two answers to one gesture.
 */
export type GraphNodeActivation =
  | { readonly kind: "fold"; readonly nodeIndex: number }
  | { readonly kind: "open"; readonly workstreamId: string }
  | { readonly kind: "select"; readonly nodeIndex: number };

export function graphNodeActivation(
  presentation: SemanticGraphPresentation,
  nodeIndex: number,
  workstreamId: string | undefined,
  selfWorkstreamId: string | null = null,
): GraphNodeActivation {
  /*
   * Your own lane folds; another thread opens. On the Director's view every
   * thread is a destination except the one you are already talking to —
   * "opening" it dispatched a selection of the view you are on, which is why
   * the Director's folded turns could never be re-expanded there.
   */
  if (
    presentation === "conversation" ||
    (workstreamId !== undefined && workstreamId === selfWorkstreamId)
  ) {
    return { kind: "fold", nodeIndex };
  }
  if (workstreamId === undefined) {
    return { kind: "select", nodeIndex };
  }
  return { kind: "open", workstreamId };
}

/** Where the camera may sit: not above what is drawn, not past the live edge. */
export interface GraphCameraBounds {
  readonly oldestCameraWorldY: number;
  readonly liveEdgeWorldY: number;
}

interface MutableGraphCameraBounds {
  oldestCameraWorldY: number;
  liveEdgeWorldY: number;
}

export interface GraphViewport {
  readonly width: number;
  readonly height: number;
}

/** The two independently scrollable regions in a Director grid. */
export type GraphScrollOwner = "director" | "supporting-grid";

/**
 * Chooses the scroll owner from the pointer's horizontal grid region.
 *
 * The boundary is halfway between the Director spine and the nearest side
 * column. That is the same Voronoi split the visible columns imply, so it
 * adapts with the semantic packer instead of duplicating its viewport rules.
 */
export function graphOverviewScrollOwner(
  presentation: SemanticGraphPresentation,
  pointerX: number,
  viewport: GraphViewport,
  nearestSideLaneDistance: number,
): GraphScrollOwner {
  if (
    presentation !== "grid" ||
    !Number.isFinite(nearestSideLaneDistance) ||
    !(nearestSideLaneDistance > 0)
  ) {
    return "director";
  }
  const nearestSideDistancePx = nearestSideLaneDistance * graphReferenceFrame.width * 0.5;
  const distanceFromDirectorPx = Math.abs(pointerX - viewport.width * 0.5);
  return distanceFromDirectorPx >= nearestSideDistancePx * 0.5 ? "supporting-grid" : "director";
}

/**
 * Camera range for one supporting document inside the Director's two stops.
 *
 * The start aligns both tops. If the supporting document is taller than the
 * Director's visible extent, the end aligns both bottoms; otherwise the range
 * collapses at the top because there is nothing independent to scroll.
 */
export function graphDirectorAnchoredScrollBounds(
  threadBounds: GraphWorldBounds,
  directorBounds: GraphWorldBounds,
  directorCameraBounds: GraphCameraBounds,
  output?: MutableGraphCameraBounds,
): GraphCameraBounds {
  const directorOldestCameraWorldY = Math.min(
    directorCameraBounds.oldestCameraWorldY,
    directorCameraBounds.liveEdgeWorldY,
  );
  const directorTopAnchor = directorBounds.top - directorOldestCameraWorldY;
  const directorBottomAnchor = directorBounds.bottom - directorCameraBounds.liveEdgeWorldY;
  const oldestCameraWorldY = threadBounds.top - directorTopAnchor;
  const bounds = output ?? { oldestCameraWorldY: 0, liveEdgeWorldY: 0 };
  bounds.oldestCameraWorldY = oldestCameraWorldY;
  bounds.liveEdgeWorldY = Math.max(oldestCameraWorldY, threadBounds.bottom - directorBottomAnchor);
  return bounds;
}

/** Allocation-free bounded camera for a secondary scroll document. */
export class GraphBoundedScrollController {
  private cameraWorldY = 0;
  private initialized = false;
  private followingLiveEdge = false;

  constructor(private readonly initialEdge: "oldest" | "live") {}

  camera(): number {
    return this.cameraWorldY;
  }

  reset(): void {
    this.cameraWorldY = 0;
    this.initialized = false;
    this.followingLiveEdge = false;
  }

  /** Keeps a user's independent position through live data and reflow. */
  reconcile(bounds: GraphCameraBounds): boolean {
    const before = this.cameraWorldY;
    if (!this.initialized) {
      this.followingLiveEdge = this.initialEdge === "live";
      this.cameraWorldY = this.followingLiveEdge
        ? bounds.liveEdgeWorldY
        : Math.min(bounds.oldestCameraWorldY, bounds.liveEdgeWorldY);
      this.initialized = true;
      return this.cameraWorldY !== before;
    }
    this.cameraWorldY = this.followingLiveEdge
      ? bounds.liveEdgeWorldY
      : clampedCamera(this.cameraWorldY, bounds);
    return this.cameraWorldY !== before;
  }

  /** Scrolls only this document; reaching its end opts into future live follow. */
  scroll(deltaYPx: number, bounds: GraphCameraBounds): boolean {
    if (!this.initialized) {
      this.reconcile(bounds);
    }
    const before = this.cameraWorldY;
    this.cameraWorldY = clampedCamera(this.cameraWorldY + deltaYPx * lookBackPerPixel, bounds);
    if (deltaYPx < 0) {
      this.followingLiveEdge = false;
    } else if (deltaYPx > 0 && this.cameraWorldY >= bounds.liveEdgeWorldY - detachEpsilon) {
      this.followingLiveEdge = true;
    }
    return this.cameraWorldY !== before;
  }
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
  visualScale = 1,
): number {
  const recent = Math.exp(-Math.max(0, cameraWorldY - worldY) * graphNodeGeometry.recencyFalloff);
  const size =
    graphNodeGeometry.baseDiameter +
    recent * graphNodeGeometry.recentBonus +
    (working ? graphNodeGeometry.workingBonus : 0);
  return size * graphNodeGeometry.cssDiameterScale * visualScale;
}

/** Matches the renderer's Director/supporting-node split for CPU overlays. */
export function graphNodeVisualScale(
  nodeIndex: number,
  directorNodeEnd: number,
  supportingNodeScale: number,
): number {
  return nodeIndex < directorNodeEnd ? 1 : supportingNodeScale;
}

export interface GraphPointerScene {
  readonly snapshot: PackedGraphSnapshot;
  /*
   * How many of the snapshot's nodes the layout has actually placed.
   *
   * A snapshot arrives before it is laid out: replacing one drops the ladder's
   * columns, and they are refilled by the next frame's advance. A pointer event
   * in that gap is the ordinary case — the mouse is already over the canvas
   * when new work lands — and reading a position that does not exist yet threw
   * out of the event handler and took the render loop with it, leaving a canvas
   * that had drawn its last frame and would never draw another.
   *
   * Nothing is hittable before it is placed, so the hit test stops here.
   */
  readonly placedNodeCount: number;
  readonly worldY: Float32Array;
  readonly open: Float32Array;
  readonly cameraWorldY: number;
  readonly timeSeconds: number;
  readonly viewport: GraphViewport;
  /** End-exclusive contiguous range kept at Director's canonical scale. */
  readonly directorNodeEnd: number;
  readonly supportingNodeScale: number;
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
  for (let index = 0; index < scene.placedNodeCount; index += 1) {
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
    graphNodeVisualScale(hit.nodeIndex, scene.directorNodeEnd, scene.supportingNodeScale),
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
  /** Visual-only spring displacement. Semantic camera bounds remain clamped. */
  private elasticOffsetPx = 0;
  private elasticVelocityPxPerSecond = 0;
  private elasticHoldSeconds = 0;
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
    this.resetElastic();
    this.hoveredNode = null;
    this.selectedNode = null;
    this.pinnedTurns.clear();
  }

  camera(): number {
    return this.cameraWorldY;
  }

  /** Camera used for drawing while the bounded semantic camera stays stable. */
  visualCamera(fit: GraphFitFrame, viewport: GraphViewport): number {
    const worldPixelsY = viewport.height * fit.fitY * 0.5;
    if (!(worldPixelsY > 0)) {
      return this.cameraWorldY;
    }
    return this.cameraWorldY + this.elasticOffsetPx / worldPixelsY;
  }

  elasticOffsetPixels(): number {
    return this.elasticOffsetPx;
  }

  elasticActive(): boolean {
    return this.elasticOffsetPx !== 0 || this.elasticVelocityPxPerSecond !== 0;
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
  lookBack(deltaYPx: number, bounds: GraphCameraBounds, elastic = false): boolean {
    const before = this.cameraWorldY;
    const candidate = this.cameraWorldY + deltaYPx * lookBackPerPixel;
    const next = clampedCamera(candidate, bounds);
    this.settleCamera(next, bounds);
    const moved = this.cameraWorldY !== before;
    const overflowWorldY = candidate - next;
    if (elastic && overflowWorldY !== 0) {
      const overflowPx = overflowWorldY / lookBackPerPixel;
      const input = overflowPx * elasticInputResistance;
      const proposed = this.elasticOffsetPx + input;
      this.elasticOffsetPx = elasticMaximumOffsetPx * Math.tanh(proposed / elasticMaximumOffsetPx);
      this.elasticVelocityPxPerSecond = 0;
      this.elasticHoldSeconds = elasticInputHoldSeconds;
      return true;
    }
    if (moved && this.elasticActive()) {
      this.resetElastic();
    }
    return moved;
  }

  /** Advances the spring and returns a 0..1 wake intensity without allocating. */
  advanceElastic(deltaSeconds: number, reducedMotion: boolean): number {
    if (reducedMotion) {
      this.resetElastic();
      return 0;
    }
    if (!this.elasticActive()) {
      return 0;
    }
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    if (this.elasticHoldSeconds > 0) {
      this.elasticHoldSeconds = Math.max(0, this.elasticHoldSeconds - delta);
      return 0;
    }
    const before = this.elasticOffsetPx;
    const acceleration =
      -elasticSpringStiffness * this.elasticOffsetPx -
      elasticSpringDamping * this.elasticVelocityPxPerSecond;
    this.elasticVelocityPxPerSecond += acceleration * delta;
    this.elasticOffsetPx += this.elasticVelocityPxPerSecond * delta;
    const returning = Math.abs(this.elasticOffsetPx) < Math.abs(before);
    const returnIntensity = returning
      ? Math.min(1, Math.abs(this.elasticVelocityPxPerSecond) / elasticDisturbanceSpeedPxPerSecond)
      : 0;
    if (
      Math.abs(this.elasticOffsetPx) <= elasticStopOffsetPx &&
      Math.abs(this.elasticVelocityPxPerSecond) <= elasticStopVelocityPxPerSecond
    ) {
      this.resetElastic();
      return returnIntensity;
    }
    return returnIntensity;
  }

  /*
   * Puts the camera back inside what is drawn.
   *
   * Folding, a new column and a replaced snapshot all move the content out from
   * under a camera that has not moved, so clamping only on the wheel left the
   * view parked somewhere with nothing in it and no way to tell. This runs every
   * frame, detached included: being detached means the camera is not following
   * the live edge, not that it may point at nothing.
   */
  clampToContent(bounds: GraphCameraBounds): void {
    const wasDetached = this.detached;
    /*
     * An attached camera is allowed to trail a live edge that just moved
     * forward. This matters while the Director is shorter than the visible
     * overview range: its oldest and live bounds collapse to the same point,
     * and a full clamp would otherwise replace the eased follow with a
     * one-frame jump. It may never lead past live. A user-detached camera still
     * receives both bounds so history cannot point outside drawn content.
     */
    this.cameraWorldY = wasDetached
      ? clampedCamera(this.cameraWorldY, bounds)
      : Math.min(this.cameraWorldY, bounds.liveEdgeWorldY);
    /*
     * Following deliberately trails the live edge while it eases. That lag is
     * motion state, not user intent. A camera that was already detached does
     * reattach when shrinking content clamps it all the way to live.
     */
    this.detached = wasDetached && this.cameraWorldY < bounds.liveEdgeWorldY - detachEpsilon;
  }

  private settleCamera(candidate: number, bounds: GraphCameraBounds): void {
    const next = clampedCamera(candidate, bounds);
    this.cameraWorldY = next;
    this.detached = next < bounds.liveEdgeWorldY - detachEpsilon;
  }

  private resetElastic(): void {
    this.elasticOffsetPx = 0;
    this.elasticVelocityPxPerSecond = 0;
    this.elasticHoldSeconds = 0;
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

  /**
   * Drops the focus a snapshot replacement invalidates. Hover and selection are
   * node indices, and a resync or a cold replay renumbers them; the camera and
   * the turn pins survive, because they are about where the user is looking and
   * which turns they opened.
   */
  clearNodeFocus(): void {
    this.hoveredNode = null;
    this.selectedNode = null;
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

function clampedCamera(candidate: number, bounds: GraphCameraBounds): number {
  const ceiling = bounds.liveEdgeWorldY;
  const floor = Math.min(ceiling, bounds.oldestCameraWorldY);
  return Math.max(floor, Math.min(ceiling, candidate));
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
  reducedMotion: boolean,
): number {
  const target = hovering ? 1 : 0;
  if (reducedMotion) {
    return target;
  }
  const next = current + (target - current) * Math.min(1, Math.max(0, deltaSeconds) * rate);
  return Math.abs(target - next) < 0.002 ? target : next;
}
