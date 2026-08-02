/**
 * The fullscreen graph canvas host.
 *
 * This is the object that owns a frame: it drains pushed batches, advances the
 * ladder, packs, uploads, draws, places labels, and decides whether the next
 * frame is needed. It is deliberately not a React component — React state must
 * never change per frame — and it depends on no production store, so it can be
 * driven by the committed fixtures long before a Director endpoint exists.
 *
 * Backpressure lives here. Batches that arrive between frames are queued and
 * coalesced into the single batch the frame applies, so a provider burst
 * produces one projection, one upload, and one draw rather than one of each per
 * pushed event.
 */

import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphSnapshot,
} from "../packed-graph-snapshot";
import { coalescePackedGraphBatches } from "../packed-graph-coalescing";
import { DirectorGraphRenderer, type GraphRenderView } from "./director-graph-renderer";
import {
  GraphFrameScheduler,
  type GraphFrameOutcome,
  type GraphFrameSchedulerHost,
  type GraphFrameTiming,
} from "./graph-frame-scheduler";
import {
  graphArtifactParticleSeed,
  type GraphArtifactParticleStyle,
} from "./graph-artifact-presentation";
import {
  GraphFrameSampler,
  GraphFrameStopwatch,
  GraphGpuTimer,
  observeGraphLongTasks,
  type GraphPerformanceSummary,
} from "./graph-instrumentation";
import { GraphLabelLayer, type GraphColumnTitlePlacement } from "./graph-label-layer";
import { checkGraphCanvasPixels, type GraphCanvasPixelCheck } from "./graph-pixel-check";
import {
  GraphLadderLayout,
  advanceGraphCamera,
  type GraphLadderFrame,
} from "./graph-ladder-layout";
import {
  computeGraphLabelPlacements,
  graphActiveTurn,
  type GraphLabelPlacement,
} from "./graph-labels";
import {
  graphReducedMotionProfile,
  graphStartingQualityProfile,
  type GraphQualityProfile,
  type GraphQualityTier,
} from "./graph-quality";
import {
  GraphScenePacker,
  graphVisibleEdgeRange,
  graphVisibleNodeRange,
  type GraphPackedScene,
  type GraphUploadRange,
} from "./graph-scene-packer";
import {
  GraphBoundedScrollController,
  GraphViewController,
  advanceHoverAmount,
  graphDirectorAnchoredScrollBounds,
  graphDirectorBoundedThreadWorldOffset,
  graphNodeAtPointer,
  graphNodeScreenPosition,
  graphOverviewScrollOwner,
  graphOutcomeAtPointer,
  type GraphScreenPoint,
  type GraphScrollOwner,
  type GraphViewport,
  graphOldestCameraWorldY,
  graphNodeActivation,
  type GraphCameraBounds,
} from "./graph-view-state";
import {
  graphFitFrame,
  graphMotionRates,
  graphNodeHierarchyScale,
  graphWarpToScreen,
} from "./graph-visual-language";
import { packedValueAt } from "../packed-graph-vocabulary";
import {
  directorGridUsesActivityNodes,
  type SemanticGraphPresentation,
} from "../semantic-graph-packer";

export interface GraphCanvasQuality {
  readonly tier: GraphQualityTier;
  /**
   * The viewport the graph is drawing at. It follows the element's resize
   * observer, which is a frame behind the DOM box, so a measurement that
   * changes the viewport waits on this rather than on the element.
   */
  readonly viewport: GraphViewport;
  readonly devicePixelRatio: number;
  readonly postWidth: number;
  readonly postHeight: number;
  readonly sceneWidth: number;
  readonly sceneHeight: number;
}

export interface DirectorGraphCanvasOptions {
  readonly canvas: HTMLCanvasElement;
  readonly labelRoot: HTMLElement;
  /** Focusable graph region described by contextual node tooltips. */
  readonly interactionRoot?: HTMLElement;
  readonly ownerDocument: Document;
  /** Current CSS size of the canvas; the component observes it. */
  readonly viewportOf: () => GraphViewport;
  readonly devicePixelRatioOf: () => number;
  /**
   * Maps a monotonic frame timestamp onto the snapshot's committed-event time
   * base. Production supplies durable event time; the fixture harness supplies
   * a replay clock. The renderer never invents either.
   */
  readonly timeSecondsAt: (timestampMs: number) => number;
  readonly reducedMotion: boolean;
  /** The callback is stable, while this reports whether its current ref has a destination. */
  readonly canOpenWorkstream?: () => boolean;
  /**
   * Opens the thread a click landed on. Supplied by the Director's views, where
   * a column or a tile is a destination; a conversation has nothing to open.
   */
  readonly onOpenWorkstream?: (workstreamId: string) => void;
  /**
   * Keeps the mockup's drifting void alive after semantic graph motion settles.
   * Fixture harnesses leave this off so completed replays can still sleep.
   */
  readonly ambientMotion?: boolean;
  /** Injected for tests and for a harness that steps frames deterministically. */
  readonly frameHost?: GraphFrameSchedulerHost;
  readonly now?: () => number;
}

const defaultFrameHost: GraphFrameSchedulerHost = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

/** The in-phase of the mockup's 620ms switch: the half after the swap. */
const workstreamSwitchSlideMs = 310;
/** A changed thread count blooms from a compact constellation into its new grid. */
const graphLayoutTransitionMs = 520;
/**
 * A pushed overview snapshot retargets from the currently drawn positions.
 *
 * Slightly longer than a quick UI fade, but short enough that a 2x development
 * simulation can interrupt and retarget it without ever building a queue of
 * motion behind the data.
 */
const graphOverviewSnapshotTransitionMs = 260;
/** Each older node in a short grid trail loses this share of opacity. */
const graphGridTrailOpacityDecay = 0.24;

/** Where the columns view pins its title row, just under the top bar. */
const columnTitleTopPx = 64;
const columnTitleTooltipMaxWidthPx = 320;
const columnTitleTooltipViewportInsetPx = 16;
/** Grid titles sit above their own node and follow the tile's bounded scroll. */
const gridTitleNodeOffsetPx = 44;
const graphTooltipMaxWidthPx = 280;
const graphTooltipViewportInsetPx = 16;
const graphTooltipEstimatedHeightPx = 112;

/** How long fresh activity speaks on side-by-side views before fading. */
const temporaryLabelSeconds = 2.4;
/** The tail of that window over which the label fades out. */
const temporaryLabelFadeSeconds = 0.8;
/** Director particle wake settles quickly after the elastic camera returns. */
const directorEdgeDisturbanceDecayPerSecond = 5.5;
const directorEdgeDisturbanceEpsilon = 0.002;
/** The field completes a normal-to-artifact morph in roughly 360ms. */
const artifactParticleTransitionPerSecond = 2.8;
const artifactParticleTransitionEpsilon = 0.001;

/** Geometric growth keeps the grid projection allocation off the scroll path. */
function graphProjectionCapacity(required: number): number {
  let capacity = 64;
  while (capacity < required) {
    capacity *= 2;
  }
  return capacity;
}

interface GraphOverviewSnapshotNodeState {
  readonly open: number;
  readonly worldY: number;
}

interface GraphOverviewSnapshotTransition {
  /** Camera at capture time, so a simultaneous camera clamp cannot move the old frame. */
  readonly cameraWorldY: number;
  readonly from: ReadonlyMap<string, GraphOverviewSnapshotNodeState>;
  /** Stable recency slot when the newest durable node itself was replaced. */
  readonly latestByWorkstream: ReadonlyMap<string, GraphOverviewSnapshotNodeState>;
  readonly startMs: number;
}

interface GraphFrameContext {
  readonly devicePixelRatio: number;
  readonly frameStart: number;
  readonly timeSeconds: number;
  readonly viewport: GraphViewport;
}

interface GraphProjectedFrame {
  readonly arrived: boolean;
  readonly cameraMoved: boolean;
  readonly hovering: boolean;
  readonly ladder: GraphLadderFrame;
  readonly projection: {
    readonly dirtyFrom: number;
    readonly dirtyTo: number;
    readonly open: Float32Array;
    readonly worldY: Float32Array;
  };
  readonly visualCamera: number;
}

interface GraphPackedFrame {
  readonly edges: GraphUploadRange;
  readonly nodes: GraphUploadRange;
  readonly scene: GraphPackedScene;
}

function graphSnapshotsShareReflowShape(
  current: PackedGraphSnapshot,
  next: PackedGraphSnapshot,
): boolean {
  return (
    next.workstreamId === current.workstreamId &&
    next.nodeCount === current.nodeCount &&
    next.edgeCount === current.edgeCount &&
    next.turnCount === current.turnCount
  );
}

function assertGraphReflowNodes(current: PackedGraphSnapshot, next: PackedGraphSnapshot): void {
  for (let index = 0; index < next.nodeCount; index += 1) {
    if (
      next.nodes.ids[index] !== current.nodes.ids[index] ||
      packedValueAt(next.nodes.turn, index) !== packedValueAt(current.nodes.turn, index)
    ) {
      throw new Error(`director graph reflow changed node ${index}`);
    }
  }
}

function assertGraphReflowEdges(current: PackedGraphSnapshot, next: PackedGraphSnapshot): void {
  for (let index = 0; index < next.edgeCount; index += 1) {
    if (
      packedValueAt(next.edges.from, index) !== packedValueAt(current.edges.from, index) ||
      packedValueAt(next.edges.to, index) !== packedValueAt(current.edges.to, index)
    ) {
      throw new Error(`director graph reflow changed edge ${index}`);
    }
  }
}

function assertGraphReflowTurns(current: PackedGraphSnapshot, next: PackedGraphSnapshot): void {
  for (let index = 0; index < next.turnCount; index += 1) {
    if (
      next.turnWorkstreamIds[index] !== current.turnWorkstreamIds[index] ||
      packedValueAt(next.turns.inputNode, index) !==
        packedValueAt(current.turns.inputNode, index) ||
      packedValueAt(next.turns.outcomeNode, index) !==
        packedValueAt(current.turns.outcomeNode, index)
    ) {
      throw new Error(`director graph reflow changed turn ${index}`);
    }
  }
}

function graphArtifactFieldIsSettled(
  style: GraphArtifactParticleStyle | null,
  particleFlowAmount: number,
  fluidAmount: number,
): boolean {
  return style === null && particleFlowAmount + fluidAmount <= artifactParticleTransitionEpsilon;
}

/** Hover animates only in the normal-motion profile; reduced motion snaps once. */
export function graphHoverNeedsAnimation(
  reducedMotion: boolean,
  hovering: boolean,
  hoverAmount: number,
): boolean {
  return !reducedMotion && (hovering || hoverAmount > 0);
}

export function graphAmbientFieldNeedsAnimation(
  reducedMotion: boolean,
  ambientMotion: boolean,
): boolean {
  return ambientMotion && !reducedMotion;
}

/** Loading borrows the ambient field, so reduced motion holds one static frame. */
export function graphLoadingFieldNeedsAnimation(
  reducedMotion: boolean,
  loading: boolean,
  loadingAmount: number,
): boolean {
  return !reducedMotion && (loading || loadingAmount > 0);
}

/** Interruptible loading fades without allocating or queuing an animation. */
export function advanceGraphLoadingAmount(
  current: number,
  loading: boolean,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  const target = loading ? 1 : 0;
  if (reducedMotion) {
    return target;
  }
  const speed = loading ? 3.6 : 5.2;
  const step = Math.max(0, deltaSeconds) * speed;
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

/** One interruptible scalar for a whole-canvas particle-system morph. */
function advanceGraphArtifactParticleAmount(
  current: number,
  target: number,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) {
    return target;
  }
  const step = Math.max(0, deltaSeconds) * artifactParticleTransitionPerSecond;
  const next =
    target > current ? Math.min(target, current + step) : Math.max(target, current - step);
  return Math.abs(next - target) <= artifactParticleTransitionEpsilon ? target : next;
}

/** Natural grid-title position. Overflow clips it after it scrolls off-screen. */
export function graphGridTitleAnchorY(nodeScreenY: number): number {
  return nodeScreenY - gridTitleNodeOffsetPx;
}

export class DirectorGraphCanvas {
  private readonly renderer: DirectorGraphRenderer;
  private readonly scheduler: GraphFrameScheduler;
  private readonly layout = new GraphLadderLayout();
  private readonly packer = new GraphScenePacker();
  private readonly view = new GraphViewController();
  private readonly labels: GraphLabelLayer;
  private readonly sampler = new GraphFrameSampler();
  private readonly stopwatch: GraphFrameStopwatch;
  private readonly placements: GraphLabelPlacement[] = [];
  private readonly now: () => number;
  private readonly ambientMotion: boolean;
  /** Camera-relative grid positions; Director layout itself remains immutable. */
  private projectedWorldY: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private frameWorldY: Float32Array<ArrayBufferLike> = this.projectedWorldY;
  /** Overview trail opacity shares the node-state texture's existing openness slot. */
  private projectedOpen: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private frameOpen: Float32Array<ArrayBufferLike> = this.projectedOpen;
  /** Scratch columns for independently bounded side-by-side thread regions. */
  private overviewColumnTopWorldY = new Float32Array(0);
  private overviewColumnBottomWorldY = new Float32Array(0);
  private overviewColumnOffsetWorldY = new Float32Array(0);
  private lastOverviewColumnOffsetWorldY = new Float32Array(0);
  /**
   * One independently scrollable activity list shared by both grid flanks.
   * It opens on its newest rows and follows from there.
   */
  private readonly supportingGridScroll = new GraphBoundedScrollController("live");
  private readonly supportingGridBounds: { oldestCameraWorldY: number; liveEdgeWorldY: number } = {
    oldestCameraWorldY: 0,
    liveEdgeWorldY: 0,
  };
  private supportingGridStickyOffsetWorldY = 0;
  /** Interruptible motion between replacement snapshots of one overview. */
  private overviewSnapshotTransition: GraphOverviewSnapshotTransition | null = null;

  private snapshot: PackedGraphSnapshot;
  private profile: GraphQualityProfile;
  private gpuTimer: GraphGpuTimer | null = null;
  private stopLongTasks: (() => void) | null = null;
  private performanceSampling = false;
  private queued: PackedGraphBatch[] = [];
  private pendingPixelChecks: ((check: GraphCanvasPixelCheck) => void)[] = [];
  private reducedMotion: boolean;
  private hoverAmount = 0;
  /** End-exclusive contiguous node range belonging to overview column zero. */
  private directorNodeEnd = 0;
  /** Cached split between the centre spine and either supporting grid flank. */
  private nearestSupportingGridLaneDistance = Number.POSITIVE_INFINITY;
  /** A single row follows the Director; only a real row list owns its own scroll. */
  private supportingGridHasMultipleRows = false;
  /** Dev-gated particle response; elastic camera motion itself is always on. */
  private directorEdgeDisturbanceEnabled = false;
  private directorEdgeDisturbance = 0;
  /*
   * Whether the next frame puts the camera at the live edge outright.
   *
   * The camera eases toward the live edge, which is how live work reads: a new
   * turn nudges the view rather than jumping it. Arriving at a different graph
   * is not live work — easing there pans across the whole conversation, which
   * on a long one is seconds of replay before the reader sees the present.
   */
  private arriveAtLiveEdge = false;
  private presentation: SemanticGraphPresentation = "conversation";
  /** A presentation change uses its own reveal, not a same-grid retarget. */
  private presentationChanged = false;
  private bounds: GraphCameraBounds = {
    oldestCameraWorldY: 0,
    liveEdgeWorldY: 0,
  };
  /** Director's own stops remain the anchors for every supporting thread. */
  private readonly directorCameraBounds: {
    oldestCameraWorldY: number;
    liveEdgeWorldY: number;
  } = {
    oldestCameraWorldY: 0,
    liveEdgeWorldY: 0,
  };
  /** Attached one-row overviews follow whichever visible thread advances furthest. */
  private automaticLiveEdgeWorldY = 0;
  private lastSurfaceKey = "";
  private lastFrameTimestampMs = 0;
  private disposed = false;
  /** The mockup's clamped frame-delta clock, independent of durable event time. */
  private fieldTimeSeconds = 0;
  /*
   * The mockup's thread-switch slide (mockup lines 1278–1285). By the time the
   * shell knows the selection changed, the new snapshot is already on screen,
   * so production plays the mockup's second half: the new graph sweeps in from
   * the arrow's direction while the post pass glitches, both easing out.
   */
  private workstreamSwitch: { direction: -1 | 0 | 1; startMs: number } | null = null;
  private layoutTransition: { from: number; startMs: number } | null = null;
  /** True while the app is capturing the user's voice; the input node breathes. */
  private listening = false;
  /** State loading is drawn in the medium, never as reply copy by the composer. */
  private loading = false;
  private loadingAmount = 0;
  /** Artifact reading mode morphs the existing post pass; React chooses only the target. */
  private artifactParticleStyle: GraphArtifactParticleStyle | null = null;
  private artifactParticleSeedKey: string | null = null;
  private artifactParticleFlowAmount = 0;
  private artifactFluidAmount = 0;
  private artifactSeedX = 0.5;
  private artifactSeedY = 0.5;
  private artifactSeedTargetX = 0.5;
  private artifactSeedTargetY = 0.5;
  /** Whether the DOM label layer draws at all; the canvas is legible alone. */
  private labelsEnabled = true;
  /** Ambient field frames do not need to recompute a settled DOM overlay. */
  private labelsDirty = true;
  /** The lane whose turns fold on click because it is the view's own thread. */
  private selfWorkstreamId: string | null = null;
  /** Thread names, drawn above each column by the label layer. */
  private columnTitles: ReadonlyMap<string, string> = new Map();
  /*
   * The node an unfold is anchored on. Expanding a folded turn grows the
   * ladder above its outcome, and the camera holds that outcome still on
   * screen while the rest of the thread unfurls — the mockup's expansion —
   * instead of letting the growth shove the node the user just clicked.
   */
  private unfoldFocus: { nodeIndex: number; anchorOffset: number } | null = null;

  constructor(private readonly options: DirectorGraphCanvasOptions) {
    this.snapshot = emptyPackedGraphSnapshot("");
    this.reducedMotion = options.reducedMotion;
    this.ambientMotion = options.ambientMotion === true;
    this.now = options.now ?? (() => performance.now());
    const viewport = options.viewportOf();
    this.profile = this.profileFor();
    this.renderer = new DirectorGraphRenderer(options.canvas, options.ownerDocument, this.profile);
    this.renderer.resize(
      viewport.width,
      viewport.height,
      options.devicePixelRatioOf(),
      options.canvas,
    );
    this.renderer.prewarm();
    this.labels = new GraphLabelLayer(options.labelRoot, options.ownerDocument, {
      interactionRoot: options.interactionRoot ?? options.labelRoot,
      onColumnTitleActivated: (workstreamId) => this.openWorkstream(workstreamId),
      onColumnTitleHovered: (workstreamId) => this.hoverWorkstream(workstreamId),
      onPillActivated: (nodeIndex) => this.activateNode(nodeIndex),
    });
    this.stopwatch = new GraphFrameStopwatch(this.now);
    this.scheduler = new GraphFrameScheduler(options.frameHost ?? defaultFrameHost, (timing) =>
      this.frame(timing),
    );
  }

  /**
   * Replaces semantic graph state: a workstream switch, resync, or cold replay.
   * Ladder ranges and packed upload ranges reset because a replacement is not
   * an extension. View state may survive a same-overview replacement: keeping
   * its bounded column offsets prevents a live node arrival from resetting a
   * scroll-direction transition halfway between sticky edges.
   */
  setSnapshot(snapshot: PackedGraphSnapshot): void {
    const overviewSnapshotTransition = this.captureOverviewSnapshotTransition(snapshot);
    const workstreamChanged = snapshot.workstreamId !== this.snapshot.workstreamId;
    const projectionChanged = workstreamChanged || this.presentationChanged;
    if (workstreamChanged) {
      this.view.reset();
      this.hoverAmount = 0;
      this.arriveAtLiveEdge = true;
    } else {
      this.view.clearNodeFocus();
    }
    this.options.interactionRoot?.removeAttribute("data-openable-thread");
    this.snapshot = snapshot;
    this.updateOverviewRanges();
    this.queued = [];
    this.layout.reset();
    this.frameWorldY = this.projectedWorldY;
    this.frameOpen = this.projectedOpen;
    if (projectionChanged) {
      this.lastOverviewColumnOffsetWorldY.fill(Number.NaN);
      this.resetSupportingGridScroll();
    }
    this.overviewSnapshotTransition = overviewSnapshotTransition;
    this.presentationChanged = false;
    this.packer.noteChanged(0, 0);
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  /**
   * Replaces viewport-authored coordinates without replaying the graph.
   *
   * Grid cell lanes, row scales, and column tops depend on the CSS viewport.
   * Everything else is the same durable graph. Keeping ladder openness, hover,
   * and animation time turns a resize into a reflow instead of a cold replay.
   */
  reflowSnapshot(snapshot: PackedGraphSnapshot): void {
    this.assertReflowTopology(snapshot);
    this.snapshot = snapshot;
    this.updateOverviewRanges();
    this.layout.reflow();
    this.overviewSnapshotTransition = null;
    this.presentationChanged = false;
    this.packer.noteChanged(0, 0);
    this.arriveAtLiveEdge = true;
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  /** Rebuilds a workstream from an ordered batch stream, e.g. a cold replay. */
  replace(workstreamId: string, batches: readonly PackedGraphBatch[]): void {
    this.setSnapshot(buildPackedGraphSnapshot(workstreamId, batches));
  }

  /**
   * Accepts one pushed batch. Application is deferred to the next frame so a
   * burst of arrivals coalesces into a single snapshot extension.
   */
  pushBatch(batch: PackedGraphBatch): void {
    this.queued.push(batch);
    this.scheduler.requestFrame();
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (reducedMotion === this.reducedMotion) {
      return;
    }
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.view.advanceElastic(0, true);
      this.directorEdgeDisturbance = 0;
      this.loadingAmount = this.loading ? 1 : 0;
      this.layoutTransition = null;
      this.overviewSnapshotTransition = null;
      this.options.labelRoot.style.opacity = "";
    }
    this.profile = this.profileFor();
    this.renderer.applyProfile(this.profile);
    // Reduced motion re-derives the effects while retaining the same geometry
    // and surfaces.
    this.lastSurfaceKey = "";
    this.scheduler.requestFrame();
  }

  setVisible(visible: boolean): void {
    this.scheduler.setVisible(visible);
  }

  /** Wakes the loop after a viewport or layout change. */
  invalidate(): void {
    this.lastSurfaceKey = "";
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  pointerMoved(point: GraphScreenPoint): void {
    this.setHoveredNode(graphNodeAtPointer(this.pointerScene(), point));
  }

  pointerLeft(): boolean {
    return this.setHoveredNode(null);
  }

  /**
   * A click on an outcome node folds or unfolds its turn; anything else
   * selects. A stray click on the graph never collapses what the user is
   * reading.
   */
  clicked(point: GraphScreenPoint): void {
    const scene = this.pointerScene();
    if (this.presentation !== "conversation") {
      const hit = graphNodeAtPointer(scene, point);
      if (hit === null) {
        return;
      }
      this.activateNode(hit);
      return;
    }
    const outcome = graphOutcomeAtPointer(scene, point);
    if (outcome !== null) {
      this.toggleTurnAt(outcome);
      return;
    }
    this.view.toggleSelected(graphNodeAtPointer(scene, point));
    this.scheduler.requestFrame();
  }

  /*
   * What activating a node does, wherever the activation came from.
   *
   * A label is a real button, so it takes the click before the canvas ever sees
   * one and drives the same decision by a different path. Both routes end here,
   * because a pill that folds a turn while the canvas beneath it opens a thread
   * is two answers to one gesture.
   */
  private activateNode(nodeIndex: number): void {
    const openable = this.openableWorkstreamId(nodeIndex) ?? undefined;
    const activation = graphNodeActivation(
      this.presentation,
      nodeIndex,
      openable,
      this.selfWorkstreamId,
    );
    if (activation.kind === "fold") {
      this.toggleTurnAt(activation.nodeIndex);
      return;
    }
    if (activation.kind === "open") {
      this.options.onOpenWorkstream?.(activation.workstreamId);
      return;
    }
    this.view.toggleSelected(activation.nodeIndex);
    this.scheduler.requestFrame();
  }

  private setHoveredNode(nodeIndex: number | null): boolean {
    const interactionRoot = this.options.interactionRoot;
    interactionRoot?.toggleAttribute(
      "data-openable-thread",
      nodeIndex !== null && this.openableWorkstreamId(nodeIndex) !== null,
    );
    if (!this.view.setHovered(nodeIndex)) {
      return false;
    }
    this.labelsDirty = true;
    this.scheduler.requestFrame();
    return true;
  }

  private canOpenWorkstream(): boolean {
    return (
      this.options.onOpenWorkstream !== undefined && (this.options.canOpenWorkstream?.() ?? true)
    );
  }

  private openableWorkstreamId(nodeIndex: number): string | null {
    if (
      !this.canOpenWorkstream() ||
      this.presentation === "conversation" ||
      nodeIndex < 0 ||
      nodeIndex >= this.snapshot.nodeCount
    ) {
      return null;
    }
    const turn = packedValueAt(this.snapshot.nodes.turn, nodeIndex);
    const workstreamId = this.snapshot.turnWorkstreamIds[turn];
    return workstreamId === undefined || workstreamId === this.selfWorkstreamId
      ? null
      : workstreamId;
  }

  private openWorkstream(workstreamId: string): void {
    if (!this.canOpenWorkstream() || workstreamId === this.selfWorkstreamId) {
      return;
    }
    this.options.onOpenWorkstream?.(workstreamId);
  }

  /** Title hover/focus previews the newest node in the same thread. */
  private hoverWorkstream(workstreamId: string | null): void {
    if (workstreamId === null) {
      this.setHoveredNode(null);
      return;
    }
    const turn = this.snapshot.turnWorkstreamIds.indexOf(workstreamId);
    if (turn < 0) {
      this.setHoveredNode(null);
      return;
    }
    for (let index = this.snapshot.nodeCount - 1; index >= 0; index -= 1) {
      if (packedValueAt(this.snapshot.nodes.turn, index) === turn) {
        this.setHoveredNode(index);
        return;
      }
    }
    this.setHoveredNode(null);
  }

  /** Routes wheel input to the graph region beneath the pointer. */
  wheeled(deltaYPx: number, point: GraphScreenPoint): void {
    if (this.scrollOwnerAt(point) === "supporting-grid") {
      if (!this.supportingGridScroll.scroll(deltaYPx, this.supportingGridBounds)) {
        return;
      }
      this.labelsDirty = true;
      this.scheduler.requestFrame();
      return;
    }
    if (!this.view.lookBack(deltaYPx, this.bounds, !this.reducedMotion)) {
      return;
    }
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  /*
   * Which presentation the canvas is drawing.
   *
   * It decides what a click means. In a conversation an outcome node folds its
   * turn, because the turns are the thing being read. On the Director's views a
   * click on any thread opens it: the columns and tiles are destinations, and
   * folding one from a view that exists to show them all is never the ask.
   */
  setPresentation(
    presentation: SemanticGraphPresentation,
    selfWorkstreamId: string | null = null,
  ): void {
    if (presentation !== this.presentation) {
      this.presentationChanged = true;
      this.overviewSnapshotTransition = null;
      this.resetSupportingGridScroll();
    }
    this.presentation = presentation;
    this.selfWorkstreamId = selfWorkstreamId;
    this.options.interactionRoot?.removeAttribute("data-openable-thread");
    this.updateOverviewRanges();
    this.labelsDirty = true;
  }

  /**
   * Names the threads. The label layer draws each name above its column,
   * anchored to the column's own input node, so a title cannot drift from the
   * thread it names whatever lane the packer chose.
   */
  setColumnTitles(titles: ReadonlyMap<string, string>): void {
    this.columnTitles = titles;
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  /**
   * Shows or hides the label layer, the mockup's labels toggle. Hiding clears
   * the layer rather than fading it, so the pills' pointer targets go with it.
   */
  setLabelsEnabled(enabled: boolean): void {
    if (enabled === this.labelsEnabled) {
      return;
    }
    this.labelsEnabled = enabled;
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  /**
   * Whether the app is actually hearing the user. The listening node's pulse
   * is gated on this, exactly as the mockup gated it on its listen toggle: a
   * node that breathes constantly says "recording" when nothing is.
   */
  setListening(listening: boolean): void {
    if (listening === this.listening) {
      return;
    }
    this.listening = listening;
    this.scheduler.requestFrame();
  }

  /** Streams the ambient medium into the visible Director nodes while state loads. */
  setLoading(loading: boolean): void {
    if (loading === this.loading) {
      return;
    }
    this.loading = loading;
    if (this.reducedMotion) {
      this.loadingAmount = loading ? 1 : 0;
    }
    this.scheduler.requestFrame();
  }

  /** Selects a stable per-artifact field, or returns to the normal graph field. */
  setArtifactParticleStyle(
    style: GraphArtifactParticleStyle | null,
    artifactId = "setta-artifact-preview",
  ): void {
    const seedKey = style === null ? null : artifactId;
    if (style === this.artifactParticleStyle && seedKey === this.artifactParticleSeedKey) {
      return;
    }
    const enteringSettledField = graphArtifactFieldIsSettled(
      this.artifactParticleStyle,
      this.artifactParticleFlowAmount,
      this.artifactFluidAmount,
    );
    this.artifactParticleStyle = style;
    this.artifactParticleSeedKey = seedKey;
    this.updateArtifactSeed(seedKey, enteringSettledField);
    this.snapArtifactFieldForReducedMotion(style);
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  private updateArtifactSeed(seedKey: string | null, enteringSettledField: boolean): void {
    if (seedKey === null) {
      return;
    }
    [this.artifactSeedTargetX, this.artifactSeedTargetY] = graphArtifactParticleSeed(seedKey);
    if (this.reducedMotion || enteringSettledField) {
      this.artifactSeedX = this.artifactSeedTargetX;
      this.artifactSeedY = this.artifactSeedTargetY;
    }
  }

  private snapArtifactFieldForReducedMotion(style: GraphArtifactParticleStyle | null): void {
    if (!this.reducedMotion) {
      return;
    }
    this.artifactParticleFlowAmount = style === "particle-flow" ? 1 : 0;
    this.artifactFluidAmount = style === "fluid" ? 1 : 0;
  }

  /** Enables the opt-in Director-only particle wake after elastic overscroll. */
  setDirectorEdgeDisturbance(enabled: boolean): void {
    if (enabled === this.directorEdgeDisturbanceEnabled) {
      return;
    }
    this.directorEdgeDisturbanceEnabled = enabled;
    if (!enabled) {
      this.directorEdgeDisturbance = 0;
    }
    this.scheduler.requestFrame();
  }

  /**
   * Plays the workstream-switch slide: the graph and its field sweep in from
   * the direction of travel with a signal glitch that settles as they land.
   * `0` glitches without sliding, for jumps with no spatial direction.
   */
  playWorkstreamSwitch(direction: -1 | 0 | 1): void {
    if (this.reducedMotion) {
      return;
    }
    this.workstreamSwitch = { direction, startMs: this.now() };
    this.scheduler.requestFrame();
  }

  /**
   * Reveals a replacement layout without moving the ambient field underneath
   * it. The graph expands from a tighter constellation while its labels fade
   * in; another selection during the reveal continues from the current value
   * rather than replaying from zero.
   */
  playLayoutTransition(): void {
    if (this.reducedMotion) {
      this.layoutTransition = null;
      this.options.labelRoot.style.opacity = "";
      return;
    }
    const now = this.now();
    const from = this.layoutTransition === null ? 0 : this.layoutTransitionRevealAt(now);
    this.layoutTransition = { from, startMs: now };
    this.scheduler.requestFrame();
  }

  /**
   * Keyboard equivalent of the hover peek: steps the peeked node along the
   * durable order so the labels are reachable without a pointer.
   */
  peekStep(direction: 1 | -1): void {
    if (this.snapshot.nodeCount === 0) {
      return;
    }
    const current = this.view.hovered();
    const next =
      current === null
        ? direction === 1
          ? 0
          : this.snapshot.nodeCount - 1
        : Math.min(this.snapshot.nodeCount - 1, Math.max(0, current + direction));
    if (this.view.setHovered(next)) {
      this.labelsDirty = true;
      this.scheduler.requestFrame();
    }
  }

  performanceSummary(): GraphPerformanceSummary {
    return this.sampler.summary();
  }

  /** False once the loop has gone to sleep: nothing on screen is moving. */
  isAwake(): boolean {
    return this.scheduler.isAwake();
  }

  /**
   * Reads the next drawn frame back and judges it. The readback has to happen
   * inside the frame that drew it, so this resolves after that frame rather
   * than sampling whatever the compositor still holds.
   */
  requestPixelCheck(): Promise<GraphCanvasPixelCheck> {
    if (this.disposed) {
      throw new Error("cannot check pixels of a disposed graph canvas");
    }
    return new Promise((resolve) => {
      this.pendingPixelChecks.push(resolve);
      this.scheduler.requestFrame();
    });
  }

  resetPerformanceSampling(): void {
    this.performanceSampling = true;
    if (this.gpuTimer === null) {
      // Timer queries are diagnostic work. Production never creates them; the
      // purpose-built harness opts in before its first measured frame.
      this.gpuTimer = new GraphGpuTimer(this.renderer.context());
    } else {
      this.gpuTimer.reset();
    }
    this.stopLongTasks?.();
    this.stopLongTasks = observeGraphLongTasks(this.sampler);
    this.sampler.reset();
  }

  currentSnapshot(): PackedGraphSnapshot {
    return this.snapshot;
  }

  /** The fixed profile and pass sizes a performance report has to state. */
  qualityState(): GraphCanvasQuality {
    const surfaces = this.renderer.surfaceSizes();
    return {
      tier: this.profile.tier,
      viewport: this.options.viewportOf(),
      devicePixelRatio: this.options.devicePixelRatioOf(),
      postWidth: surfaces.postWidth,
      postHeight: surfaces.postHeight,
      sceneWidth: surfaces.sceneWidth,
      sceneHeight: surfaces.sceneHeight,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.options.interactionRoot?.removeAttribute("data-openable-thread");
    this.scheduler.stop();
    this.stopLongTasks?.();
    this.gpuTimer?.dispose();
    this.labels.dispose();
    this.renderer.dispose();
  }

  private profileFor() {
    const profile = graphStartingQualityProfile();
    return this.reducedMotion ? graphReducedMotionProfile(profile) : profile;
  }

  private toggleTurnAt(nodeIndex: number): void {
    if (nodeIndex < 0 || nodeIndex >= this.snapshot.nodeCount) {
      return;
    }
    const turn = packedValueAt(this.snapshot.nodes.turn, nodeIndex);
    const wasFolded = this.layout.turnOpenness(turn) <= 0.5;
    this.view.toggleTurnPin(turn, this.layout.turnOpenness(turn) > 0.5);
    if (wasFolded) {
      // Anchor the expansion on the turn's outcome — the node that was
      // clicked is usually its pill — so the ladder unfurls around it.
      const outcome = packedValueAt(this.snapshot.turns.outcomeNode, turn);
      const anchor = outcome >= 0 ? outcome : nodeIndex;
      this.unfoldFocus = {
        nodeIndex: anchor,
        anchorOffset: this.layout.nodeWorldY(anchor) - this.view.camera(),
      };
    }
    this.labelsDirty = true;
    this.scheduler.requestFrame();
  }

  private assertReflowTopology(next: PackedGraphSnapshot): void {
    if (!graphSnapshotsShareReflowShape(this.snapshot, next)) {
      throw new Error("director graph reflow changed snapshot topology");
    }
    assertGraphReflowNodes(this.snapshot, next);
    assertGraphReflowEdges(this.snapshot, next);
    assertGraphReflowTurns(this.snapshot, next);
  }

  private pointerScene() {
    const viewport = this.options.viewportOf();
    const fit = graphFitFrame(viewport.width, viewport.height);
    return {
      snapshot: this.snapshot,
      placedNodeCount: Math.min(this.snapshot.nodeCount, this.layout.placedNodeCount()),
      worldY: this.frameWorldY,
      open: this.frameOpen,
      cameraWorldY: this.view.visualCamera(fit, viewport),
      timeSeconds: this.options.timeSecondsAt(this.lastFrameTimestampMs),
      viewport,
      directorNodeEnd: this.directorNodeEnd,
      supportingNodeScale: this.supportingNodeScale(),
    };
  }

  /** A multi-row grid splits wheel ownership; one row travels with the Director. */
  private scrollOwnerAt(point: GraphScreenPoint): GraphScrollOwner {
    if (!this.supportingGridHasMultipleRows) {
      return "director";
    }
    return graphOverviewScrollOwner(
      this.presentation,
      point.x,
      this.options.viewportOf(),
      this.nearestSupportingGridLaneDistance,
    );
  }

  private resetSupportingGridScroll(): void {
    this.supportingGridScroll.reset();
    this.supportingGridBounds.oldestCameraWorldY = 0;
    this.supportingGridBounds.liveEdgeWorldY = 0;
    this.supportingGridStickyOffsetWorldY = 0;
  }

  private drainQueue(): boolean {
    if (this.queued.length === 0) {
      return false;
    }
    const batch = coalescePackedGraphBatches(this.queued);
    this.queued = [];
    const next = extendPackedGraphSnapshot(this.snapshot, batch);
    this.packer.noteChanged(next.changed.nodesFrom, next.changed.edgesFrom);
    this.snapshot = next;
    this.updateOverviewRanges();
    this.labelsDirty = true;
    return true;
  }

  /** Caches overview ranges so wheel input and split draws stay constant-time. */
  private updateOverviewRanges(): void {
    this.nearestSupportingGridLaneDistance = Number.POSITIVE_INFINITY;
    this.supportingGridHasMultipleRows = false;
    let supportingGridTop: number | null = null;
    for (let turn = 0; turn < this.snapshot.turnCount; turn += 1) {
      if (packedValueAt(this.snapshot.turns.column, turn) === 0) {
        continue;
      }
      const columnTop = packedValueAt(this.snapshot.turns.columnTop, turn);
      if (supportingGridTop === null) {
        supportingGridTop = columnTop;
      } else if (Math.abs(columnTop - supportingGridTop) > 0.001) {
        this.supportingGridHasMultipleRows = true;
      }
      const inputNode = packedValueAt(this.snapshot.turns.inputNode, turn);
      this.nearestSupportingGridLaneDistance = Math.min(
        this.nearestSupportingGridLaneDistance,
        Math.abs(packedValueAt(this.snapshot.nodes.lane, inputNode)),
      );
    }

    // Director nodes are packed first, so their particle draw is one range.
    const directorWorkstreamId = this.selfWorkstreamId;
    if (
      directorWorkstreamId === null ||
      this.snapshot.turnWorkstreamIds[0] !== directorWorkstreamId
    ) {
      this.directorNodeEnd = 0;
      return;
    }
    let end = 0;
    while (end < this.snapshot.nodeCount) {
      const turn = packedValueAt(this.snapshot.nodes.turn, end);
      if (this.snapshot.turnWorkstreamIds[turn] !== directorWorkstreamId) {
        break;
      }
      end += 1;
    }
    this.directorNodeEnd = end;
  }

  private frame(timing: GraphFrameTiming): GraphFrameOutcome {
    const context = this.beginGraphFrame(timing);
    const projection = this.advanceGraphProjection(timing, context);
    const packed = this.packGraphProjection(projection);
    this.drawGraphFrame(context, projection, packed);
    this.refreshFrameLabels(context, projection, packed.nodes);
    this.finishFramePerformance(context.frameStart, timing);
    return this.decideOutcome(
      projection.ladder,
      context.timeSeconds,
      projection.arrived,
      projection.hovering,
    );
  }

  private beginGraphFrame(timing: GraphFrameTiming): GraphFrameContext {
    const frameStart = this.performanceSampling ? this.stopwatch.beginFrame() : 0;
    this.lastFrameTimestampMs = timing.timestampMs;
    const timeSeconds = this.options.timeSecondsAt(timing.timestampMs);
    if (!this.reducedMotion) {
      this.fieldTimeSeconds += timing.deltaSeconds;
    }
    this.loadingAmount = advanceGraphLoadingAmount(
      this.loadingAmount,
      this.loading,
      timing.deltaSeconds,
      this.reducedMotion,
    );
    this.advanceArtifactField(timing.deltaSeconds);
    return {
      devicePixelRatio: this.options.devicePixelRatioOf(),
      frameStart,
      timeSeconds,
      viewport: this.options.viewportOf(),
    };
  }

  private advanceArtifactField(deltaSeconds: number): void {
    this.artifactParticleFlowAmount = advanceGraphArtifactParticleAmount(
      this.artifactParticleFlowAmount,
      this.artifactParticleStyle === "particle-flow" ? 1 : 0,
      deltaSeconds,
      this.reducedMotion,
    );
    this.artifactFluidAmount = advanceGraphArtifactParticleAmount(
      this.artifactFluidAmount,
      this.artifactParticleStyle === "fluid" ? 1 : 0,
      deltaSeconds,
      this.reducedMotion,
    );
    this.artifactSeedX = advanceGraphArtifactParticleAmount(
      this.artifactSeedX,
      this.artifactSeedTargetX,
      deltaSeconds,
      this.reducedMotion,
    );
    this.artifactSeedY = advanceGraphArtifactParticleAmount(
      this.artifactSeedY,
      this.artifactSeedTargetY,
      deltaSeconds,
      this.reducedMotion,
    );
  }

  private advanceGraphProjection(
    timing: GraphFrameTiming,
    context: GraphFrameContext,
  ): GraphProjectedFrame {
    if (this.performanceSampling) {
      this.stopwatch.begin("projection");
    }
    const arrived = this.drainQueue();
    const ladder = this.layout.advance(this.snapshot, {
      timeSeconds: context.timeSeconds,
      deltaSeconds: timing.deltaSeconds,
      pinnedTurns: this.view.pins(),
      reducedMotion: this.reducedMotion,
      cameraColumn: this.presentation === "conversation" ? undefined : 0,
      anchorFoldsToOutcome: this.presentation === "grid",
    });
    const { cameraMoved, visualCamera } = this.advanceGraphCamera(
      ladder,
      timing.deltaSeconds,
      context.viewport,
    );
    const projection = this.projectWorldY(ladder);
    const hovering = this.view.hovered() !== null;
    this.hoverAmount = advanceHoverAmount(
      this.hoverAmount,
      hovering,
      timing.deltaSeconds,
      graphMotionRates.hover,
      this.reducedMotion,
    );
    return { arrived, cameraMoved, hovering, ladder, projection, visualCamera };
  }

  private advanceGraphCamera(
    ladder: GraphLadderFrame,
    deltaSeconds: number,
    viewport: GraphViewport,
  ): { readonly cameraMoved: boolean; readonly visualCamera: number } {
    const fit = graphFitFrame(viewport.width, viewport.height);
    const cameraBefore = this.view.camera();
    const visualCameraBefore = this.view.visualCamera(fit, viewport);
    this.updateGraphCameraBounds(ladder, fit.fitY);
    if (this.unfoldFocus !== null && !ladder.foldAnimating) {
      // The expansion has landed; the camera may drift back to the live edge.
      this.unfoldFocus = null;
    }
    this.view.followLiveEdge(this.graphCameraFollowTarget(deltaSeconds));
    // Every frame, detached included: the content moves under a camera that has
    // not, and a camera outside it draws nothing with no way to say so.
    this.view.clampToContent(this.bounds);
    const elasticReturnIntensity = this.view.advanceElastic(deltaSeconds, this.reducedMotion);
    this.advanceDirectorEdgeDisturbance(elasticReturnIntensity, deltaSeconds);
    const visualCamera = this.view.visualCamera(fit, viewport);
    const cameraMoved = this.view.camera() !== cameraBefore || visualCamera !== visualCameraBefore;
    this.arriveAtLiveEdge = false;
    return { cameraMoved, visualCamera };
  }

  private updateGraphCameraBounds(ladder: GraphLadderFrame, fitY: number): void {
    this.directorCameraBounds.oldestCameraWorldY = graphOldestCameraWorldY(
      ladder.contentTopWorldY,
      fitY,
      this.presentation,
    );
    this.directorCameraBounds.liveEdgeWorldY = ladder.liveEdgeWorldY;
    this.automaticLiveEdgeWorldY =
      this.presentation === "columns" ||
      (this.presentation === "grid" && !this.supportingGridHasMultipleRows)
        ? ladder.furthestLiveEdgeWorldY
        : ladder.liveEdgeWorldY;
    this.bounds = {
      oldestCameraWorldY: this.directorCameraBounds.oldestCameraWorldY,
      liveEdgeWorldY: this.automaticLiveEdgeWorldY,
    };
  }

  private graphCameraFollowTarget(deltaSeconds: number): number {
    if (this.unfoldFocus !== null) {
      // Hold the clicked outcome still while its ladder unfurls: the camera
      // rides the node's own layout motion instead of easing to the live edge.
      return this.layout.nodeWorldY(this.unfoldFocus.nodeIndex) - this.unfoldFocus.anchorOffset;
    }
    if (this.arriveAtLiveEdge) {
      return this.automaticLiveEdgeWorldY;
    }
    return advanceGraphCamera(
      this.view.camera(),
      this.automaticLiveEdgeWorldY,
      deltaSeconds,
      this.reducedMotion,
    );
  }

  private packGraphProjection(projection: GraphProjectedFrame): GraphPackedFrame {
    if (this.performanceSampling) {
      this.stopwatch.begin("packing");
    }
    const scene = this.packer.sync(
      this.snapshot,
      { worldY: projection.projection.worldY, open: projection.projection.open },
      { from: projection.projection.dirtyFrom, to: projection.projection.dirtyTo },
    );
    const profile = this.profile;
    /*
     * Culling reads worldY as sorted, which it is down one column and is not
     * across several: each column restarts at its own top, so a binary search
     * lands anywhere and drops nodes that are on screen. A composition is
     * bounded by the snapshot budget, so it is drawn whole rather than searched
     * wrongly.
     */
    const nodes =
      projection.ladder.columnCount > 1
        ? { from: 0, to: this.snapshot.nodeCount }
        : graphVisibleNodeRange(
            projection.projection.worldY,
            this.snapshot.nodeCount,
            projection.visualCamera,
            profile.visibleHalfWindow,
          );
    const edges = graphVisibleEdgeRange(this.snapshot.edges.to, this.snapshot.edgeCount, nodes);
    return { edges, nodes, scene };
  }

  private drawGraphFrame(
    context: GraphFrameContext,
    projection: GraphProjectedFrame,
    packed: GraphPackedFrame,
  ): void {
    if (this.performanceSampling) {
      this.stopwatch.begin("upload");
    }
    this.applyViewport(context.viewport, context.devicePixelRatio);
    this.renderer.upload(packed.scene);

    if (this.performanceSampling) {
      this.stopwatch.begin("draw");
      this.gpuTimer?.beginFrame();
    }
    this.renderer.render({
      snapshot: this.snapshot,
      scene: packed.scene,
      worldY: projection.projection.worldY,
      nodes: packed.nodes,
      edges: packed.edges,
      view: this.renderView(context.timeSeconds, projection.visualCamera),
    });
    if (this.performanceSampling) {
      this.gpuTimer?.endFrame();
      this.stopwatch.end();
    }
    this.resolvePixelChecks(context.viewport);
  }

  private refreshFrameLabels(
    context: GraphFrameContext,
    projection: GraphProjectedFrame,
    nodes: GraphUploadRange,
  ): void {
    if (
      this.labelsDirty ||
      projection.cameraMoved ||
      projection.projection.dirtyFrom < projection.projection.dirtyTo ||
      context.timeSeconds < projection.ladder.quietUntilSeconds
    ) {
      this.updateLabels(context.timeSeconds, context.viewport, nodes, projection.visualCamera);
      this.labelsDirty = false;
    }
  }

  private finishFramePerformance(frameStart: number, timing: GraphFrameTiming): void {
    if (this.performanceSampling) {
      this.recordFrame(frameStart, timing);
    }
  }

  /** Decays one scalar; the opt-in wake adds no buffers or particles. */
  private advanceDirectorEdgeDisturbance(returnIntensity: number, deltaSeconds: number): void {
    if (
      !this.directorEdgeDisturbanceEnabled ||
      this.reducedMotion ||
      this.presentation === "conversation" ||
      this.directorNodeEnd === 0
    ) {
      this.directorEdgeDisturbance = 0;
      return;
    }
    const decayed =
      this.directorEdgeDisturbance *
      Math.exp(-Math.max(0, deltaSeconds) * directorEdgeDisturbanceDecayPerSecond);
    this.directorEdgeDisturbance = Math.max(returnIntensity, decayed);
    if (this.directorEdgeDisturbance < directorEdgeDisturbanceEpsilon) {
      this.directorEdgeDisturbance = 0;
    }
  }

  /**
   * Projects side-thread summaries without moving Director history.
   *
   * Columns and a one-row grid move with the Director camera until each shorter
   * thread reaches the Director's own top or bottom. Only a multi-row grid owns
   * an independent camera shared by both flanks; its final offset cancels
   * Director camera motion while its start and end remain the Director's own
   * two stops. Grid rows therefore scroll as one coherent document and never
   * shear apart. Both overview presentations share trail fading and
   * interruptible snapshot motion.
   */
  private projectWorldY(ladder: GraphLadderFrame): {
    readonly worldY: Float32Array;
    readonly open: Float32Array;
    readonly dirtyFrom: number;
    readonly dirtyTo: number;
  } {
    if (this.presentation === "conversation" || this.snapshot.turnCount <= 1) {
      return this.useLadderProjection(ladder);
    }

    const { columnCount, columnsReallocated, firstSideNode } = this.prepareOverviewColumns(ladder);
    if (firstSideNode >= this.snapshot.nodeCount) {
      return this.useLadderProjection(ladder);
    }

    this.applyOverviewColumnOffsets(ladder, columnCount);
    const reallocated = this.ensureOverviewProjectionCapacity();
    this.writeOverviewProjection(ladder);
    this.applyOverviewTrailOpacity();
    const transitionActive = this.applyOverviewSnapshotTransition();
    const offsetChanged = this.commitOverviewColumnOffsets(columnsReallocated, columnCount);
    this.frameWorldY = this.projectedWorldY;
    this.frameOpen = this.projectedOpen;
    return {
      worldY: this.projectedWorldY,
      open: this.projectedOpen,
      dirtyFrom: this.overviewProjectionDirtyFrom({
        firstSideNode,
        ladderDirtyFrom: ladder.dirtyFrom,
        offsetChanged,
        reallocated,
        transitionActive,
      }),
      dirtyTo: this.snapshot.nodeCount,
    };
  }

  private useLadderProjection(ladder: GraphLadderFrame) {
    this.frameWorldY = ladder.worldY;
    this.frameOpen = ladder.open;
    this.lastOverviewColumnOffsetWorldY.fill(Number.NaN);
    this.resetSupportingGridScroll();
    this.overviewSnapshotTransition = null;
    return {
      dirtyFrom: ladder.dirtyFrom,
      dirtyTo: ladder.dirtyTo,
      open: ladder.open,
      worldY: ladder.worldY,
    };
  }

  private prepareOverviewColumns(ladder: GraphLadderFrame): {
    readonly columnCount: number;
    readonly columnsReallocated: boolean;
    readonly firstSideNode: number;
  } {
    const columnCount = ladder.columnCount;
    const columnsReallocated = this.overviewColumnTopWorldY.length < columnCount;
    if (columnsReallocated) {
      this.allocateOverviewColumns(columnCount);
    }
    this.overviewColumnTopWorldY.fill(Number.POSITIVE_INFINITY, 0, columnCount);
    this.overviewColumnBottomWorldY.fill(Number.NEGATIVE_INFINITY, 0, columnCount);
    this.overviewColumnOffsetWorldY.fill(0, 0, columnCount);
    return {
      columnCount,
      columnsReallocated,
      firstSideNode: this.measureOverviewColumns(ladder),
    };
  }

  private allocateOverviewColumns(columnCount: number): void {
    const capacity = graphProjectionCapacity(columnCount);
    this.overviewColumnTopWorldY = new Float32Array(capacity);
    this.overviewColumnBottomWorldY = new Float32Array(capacity);
    this.overviewColumnOffsetWorldY = new Float32Array(capacity);
    this.lastOverviewColumnOffsetWorldY = new Float32Array(capacity);
    this.lastOverviewColumnOffsetWorldY.fill(Number.NaN);
  }

  private measureOverviewColumns(ladder: GraphLadderFrame): number {
    let firstSideNode = this.snapshot.nodeCount;
    for (let index = 0; index < this.snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(this.snapshot.nodes.turn, index);
      const column = packedValueAt(this.snapshot.turns.column, turn);
      if (column === 0) {
        continue;
      }
      const worldY = packedValueAt(ladder.worldY, index);
      this.overviewColumnTopWorldY[column] = Math.min(
        packedValueAt(this.overviewColumnTopWorldY, column),
        worldY,
      );
      this.overviewColumnBottomWorldY[column] = Math.max(
        packedValueAt(this.overviewColumnBottomWorldY, column),
        worldY,
      );
      firstSideNode = Math.min(firstSideNode, index);
    }
    return firstSideNode;
  }

  private applyOverviewColumnOffsets(ladder: GraphLadderFrame, columnCount: number): void {
    const directorBounds = { bottom: ladder.liveEdgeWorldY, top: ladder.contentTopWorldY };
    if (this.presentation === "grid" && this.supportingGridHasMultipleRows) {
      this.applySupportingGridColumnOffsets(columnCount, directorBounds);
      return;
    }
    this.applyIndependentOverviewColumnOffsets(columnCount, directorBounds);
  }

  private applySupportingGridColumnOffsets(
    columnCount: number,
    directorBounds: { readonly bottom: number; readonly top: number },
  ): void {
    let sideTop = Number.POSITIVE_INFINITY;
    let sideBottom = Number.NEGATIVE_INFINITY;
    for (let column = 1; column < columnCount; column += 1) {
      sideTop = Math.min(sideTop, packedValueAt(this.overviewColumnTopWorldY, column));
      sideBottom = Math.max(sideBottom, packedValueAt(this.overviewColumnBottomWorldY, column));
    }
    const sideBounds = { bottom: sideBottom, top: sideTop };
    graphDirectorAnchoredScrollBounds(
      sideBounds,
      directorBounds,
      this.directorCameraBounds,
      this.supportingGridBounds,
    );
    this.supportingGridScroll.reconcile(this.supportingGridBounds);
    const gridCameraWorldY = this.supportingGridScroll.camera();
    this.supportingGridStickyOffsetWorldY = graphDirectorBoundedThreadWorldOffset(
      sideBounds,
      directorBounds,
      this.directorCameraBounds,
      gridCameraWorldY,
      this.supportingGridStickyOffsetWorldY,
    );
    const offset = this.view.camera() - gridCameraWorldY + this.supportingGridStickyOffsetWorldY;
    this.overviewColumnOffsetWorldY.fill(offset, 1, columnCount);
  }

  private applyIndependentOverviewColumnOffsets(
    columnCount: number,
    directorBounds: { readonly bottom: number; readonly top: number },
  ): void {
    this.resetSupportingGridScroll();
    for (let column = 1; column < columnCount; column += 1) {
      const top = packedValueAt(this.overviewColumnTopWorldY, column);
      const bottom = packedValueAt(this.overviewColumnBottomWorldY, column);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
        continue;
      }
      this.overviewColumnOffsetWorldY[column] = graphDirectorBoundedThreadWorldOffset(
        { bottom, top },
        directorBounds,
        this.directorCameraBounds,
        this.view.camera(),
        packedValueAt(this.lastOverviewColumnOffsetWorldY, column),
      );
    }
  }

  private ensureOverviewProjectionCapacity(): boolean {
    const reallocated =
      this.projectedWorldY.length < this.snapshot.nodeCount ||
      this.projectedOpen.length < this.snapshot.nodeCount;
    if (reallocated) {
      const capacity = graphProjectionCapacity(this.snapshot.nodeCount);
      this.projectedWorldY = new Float32Array(capacity);
      this.projectedOpen = new Float32Array(capacity);
    }
    return reallocated;
  }

  private writeOverviewProjection(ladder: GraphLadderFrame): void {
    for (let index = 0; index < this.snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(this.snapshot.nodes.turn, index);
      const column = packedValueAt(this.snapshot.turns.column, turn);
      this.projectedWorldY[index] =
        packedValueAt(ladder.worldY, index) +
        packedValueAt(this.overviewColumnOffsetWorldY, column);
      this.projectedOpen[index] = packedValueAt(ladder.open, index);
    }
  }

  private commitOverviewColumnOffsets(reallocated: boolean, columnCount: number): boolean {
    let changed = reallocated;
    for (let column = 1; column < columnCount; column += 1) {
      const offset = packedValueAt(this.overviewColumnOffsetWorldY, column);
      const previous = packedValueAt(this.lastOverviewColumnOffsetWorldY, column);
      if (!Number.isFinite(previous) || Math.abs(offset - previous) > 0.000_000_1) {
        changed = true;
      }
      this.lastOverviewColumnOffsetWorldY[column] = offset;
    }
    return changed;
  }

  private overviewProjectionDirtyFrom({
    firstSideNode,
    ladderDirtyFrom,
    offsetChanged,
    reallocated,
    transitionActive,
  }: {
    readonly firstSideNode: number;
    readonly ladderDirtyFrom: number;
    readonly offsetChanged: boolean;
    readonly reallocated: boolean;
    readonly transitionActive: boolean;
  }): number {
    if (reallocated) {
      return 0;
    }
    const overviewDirtyFrom =
      offsetChanged || transitionActive ? firstSideNode : this.snapshot.nodeCount;
    return Math.min(ladderDirtyFrom, overviewDirtyFrom);
  }

  /**
   * Fades a grid tile from its newest fact into at most two hints of history.
   * Side-by-side columns retain their complete thread shapes. Dense grids
   * already contain one node per side thread, so their sole node stays fully
   * opaque and simply adopts the latest visual type.
   */
  private applyOverviewTrailOpacity(): void {
    if (this.presentation !== "grid") {
      return;
    }
    let first = 0;
    while (first < this.snapshot.nodeCount) {
      const turn = packedValueAt(this.snapshot.nodes.turn, first);
      let end = first + 1;
      while (
        end < this.snapshot.nodeCount &&
        packedValueAt(this.snapshot.nodes.turn, end) === turn
      ) {
        end += 1;
      }
      const side = packedValueAt(this.snapshot.turns.column, turn) !== 0;
      if (side) {
        for (let index = first; index < end; index += 1) {
          const distanceFromNewest = end - index - 1;
          this.projectedOpen[index] =
            packedValueAt(this.projectedOpen, index) *
            Math.pow(graphGridTrailOpacityDecay, distanceFromNewest);
        }
      }
      first = end;
    }
  }

  /** Captures the currently drawn state so the next snapshot can retarget it. */
  private captureOverviewSnapshotTransition(
    next: PackedGraphSnapshot,
  ): GraphOverviewSnapshotTransition | null {
    if (!this.canCaptureOverviewSnapshotTransition(next)) {
      return null;
    }
    const { from, latestByWorkstream } = this.captureOverviewSnapshotNodeStates(next);
    if (from.size === 0 && latestByWorkstream.size === 0) {
      return null;
    }
    const viewport = this.options.viewportOf();
    const fit = graphFitFrame(viewport.width, viewport.height);
    return {
      cameraWorldY: this.view.visualCamera(fit, viewport),
      from,
      latestByWorkstream,
      startMs: this.now(),
    };
  }

  private canCaptureOverviewSnapshotTransition(next: PackedGraphSnapshot): boolean {
    return (
      !this.reducedMotion &&
      this.presentation !== "conversation" &&
      !this.presentationChanged &&
      next.workstreamId === this.snapshot.workstreamId &&
      this.snapshot.turnCount > 1 &&
      next.turnCount > 1
    );
  }

  private captureOverviewSnapshotNodeStates(next: PackedGraphSnapshot): {
    readonly from: Map<string, GraphOverviewSnapshotNodeState>;
    readonly latestByWorkstream: Map<string, GraphOverviewSnapshotNodeState>;
  } {
    const from = new Map<string, GraphOverviewSnapshotNodeState>();
    const latestByWorkstream = new Map<string, GraphOverviewSnapshotNodeState>();
    const nextWorkstreams = new Set(next.turnWorkstreamIds);
    const placed = Math.min(
      this.snapshot.nodeCount,
      this.layout.placedNodeCount(),
      this.frameWorldY.length,
      this.frameOpen.length,
    );
    for (let index = 0; index < placed; index += 1) {
      const id = this.snapshot.nodes.ids[index];
      const turn = packedValueAt(this.snapshot.nodes.turn, index);
      if (packedValueAt(this.snapshot.turns.column, turn) === 0) {
        continue;
      }
      const state = {
        open: packedValueAt(this.frameOpen, index),
        worldY: packedValueAt(this.frameWorldY, index),
      } satisfies GraphOverviewSnapshotNodeState;
      if (id !== undefined && next.nodeIndexById.has(id)) {
        from.set(id, state);
      }
      this.captureLatestOverviewWorkstreamState({
        index,
        latestByWorkstream,
        nextWorkstreams,
        placed,
        state,
        turn,
      });
    }
    return { from, latestByWorkstream };
  }

  private captureLatestOverviewWorkstreamState({
    index,
    latestByWorkstream,
    nextWorkstreams,
    placed,
    state,
    turn,
  }: {
    readonly index: number;
    readonly latestByWorkstream: Map<string, GraphOverviewSnapshotNodeState>;
    readonly nextWorkstreams: ReadonlySet<string>;
    readonly placed: number;
    readonly state: GraphOverviewSnapshotNodeState;
    readonly turn: number;
  }): void {
    const lastInTurn =
      index + 1 >= placed || packedValueAt(this.snapshot.nodes.turn, index + 1) !== turn;
    const workstreamId = this.snapshot.turnWorkstreamIds[turn];
    if (lastInTurn && workstreamId !== undefined && nextWorkstreams.has(workstreamId)) {
      latestByWorkstream.set(workstreamId, state);
    }
  }

  /** Applies one interruptible smooth step to matching nodes in the new snapshot. */
  private applyOverviewSnapshotTransition(): boolean {
    const transition = this.overviewSnapshotTransition;
    if (transition === null) {
      return false;
    }
    const progress = Math.max(
      0,
      Math.min(1, (this.now() - transition.startMs) / graphOverviewSnapshotTransitionMs),
    );
    // Smoothstep starts at zero velocity, so the first painted frame cannot
    // preserve a smaller version of the snap this transition is removing.
    const eased = progress * progress * (3 - 2 * progress);
    const viewport = this.options.viewportOf();
    const fit = graphFitFrame(viewport.width, viewport.height);
    const visualCamera = this.view.visualCamera(fit, viewport);
    for (let index = 0; index < this.snapshot.nodeCount; index += 1) {
      const from = this.overviewTransitionSourceAt(index, transition);
      if (from === undefined) {
        continue;
      }
      const screenStableFromWorldY = from.worldY + (visualCamera - transition.cameraWorldY);
      this.projectedWorldY[index] =
        screenStableFromWorldY +
        (packedValueAt(this.projectedWorldY, index) - screenStableFromWorldY) * eased;
      this.projectedOpen[index] =
        from.open + (packedValueAt(this.projectedOpen, index) - from.open) * eased;
    }
    if (progress >= 1) {
      this.overviewSnapshotTransition = null;
    }
    // The completion frame still changed state: upload and place labels at the
    // exact target before the scheduler is allowed to sleep.
    return true;
  }

  private overviewTransitionSourceAt(
    index: number,
    transition: GraphOverviewSnapshotTransition,
  ): GraphOverviewSnapshotNodeState | undefined {
    const id = this.snapshot.nodes.ids[index];
    const matching = id === undefined ? undefined : transition.from.get(id);
    if (matching !== undefined) {
      return matching;
    }
    const turn = packedValueAt(this.snapshot.nodes.turn, index);
    const newestInTurn =
      index + 1 >= this.snapshot.nodeCount ||
      packedValueAt(this.snapshot.nodes.turn, index + 1) !== turn;
    const workstreamId = this.snapshot.turnWorkstreamIds[turn];
    return newestInTurn && workstreamId !== undefined
      ? transition.latestByWorkstream.get(workstreamId)
      : undefined;
  }

  private resolvePixelChecks(viewport: GraphViewport): void {
    if (this.pendingPixelChecks.length === 0) {
      return;
    }
    const waiting = this.pendingPixelChecks;
    this.pendingPixelChecks = [];
    const surfaces = this.renderer.surfaceSizes();
    const pixels = new Uint8Array(surfaces.postWidth * surfaces.postHeight * 4);
    this.renderer.readCanvasPixels(pixels);
    const check = checkGraphCanvasPixels({
      pixels,
      width: surfaces.postWidth,
      height: surfaces.postHeight,
      fit: graphFitFrame(viewport.width, viewport.height),
    });
    for (const resolve of waiting) {
      resolve(check);
    }
  }

  private renderView(timeSeconds: number, visualCameraWorldY: number): GraphRenderView {
    const hovered = this.view.hovered();
    const now = this.now();
    const switchMotion = this.workstreamSwitchMotion(now);
    const layoutReveal = this.layoutTransitionRevealAt(now);
    const artifactAmount = Math.min(1, this.artifactParticleFlowAmount + this.artifactFluidAmount);
    const labelOpacity =
      switchMotion.labelOpacity * layoutReveal * layoutReveal * (1 - artifactAmount);
    const labelOpacityValue = labelOpacity >= 0.999 ? "" : String(labelOpacity);
    if (this.options.labelRoot.style.opacity !== labelOpacityValue) {
      this.options.labelRoot.style.opacity = labelOpacityValue;
    }
    return {
      timeSeconds,
      fieldTimeSeconds: this.fieldTimeSeconds,
      cameraWorldY: visualCameraWorldY,
      directorNodeEnd: this.directorNodeEnd,
      gridTrailOpacity: this.presentation === "grid" ? 1 : 0,
      supportingNodeScale: this.supportingNodeScale(),
      directorEdgeDisturbance: this.directorEdgeDisturbance,
      hoverLaneX: hovered === null ? 0 : packedValueAt(this.snapshot.nodes.lane, hovered),
      hoverWorldY: hovered === null ? 0 : packedValueAt(this.frameWorldY, hovered),
      hoverAmount: this.hoverAmount,
      shiftX: switchMotion.shiftX,
      glitch: switchMotion.glitch,
      layoutReveal,
      listening: this.listening ? 1 : 0,
      loadingAmount: this.loadingAmount,
      artifactParticleFlowAmount: this.artifactParticleFlowAmount,
      artifactFluidAmount: this.artifactFluidAmount,
      artifactSeedX: this.artifactSeedX,
      artifactSeedY: this.artifactSeedY,
      reducedMotion: this.reducedMotion,
    };
  }

  /**
   * Where the slide is right now. The mockup's in-phase: position eases out
   * cubically from a full viewport off to rest, and the glitch is the tail of
   * the sine that peaked at the swap (mockup lines 1281–1283).
   */
  private workstreamSwitchMotion(now: number): {
    shiftX: number;
    glitch: number;
    labelOpacity: number;
  } {
    const active = this.workstreamSwitch;
    if (active === null) {
      return { shiftX: 0, glitch: 0, labelOpacity: 1 };
    }
    const progress = (now - active.startMs) / workstreamSwitchSlideMs;
    if (progress >= 1) {
      this.workstreamSwitch = null;
      return { shiftX: 0, glitch: 0, labelOpacity: 1 };
    }
    const remaining = 1 - progress;
    return {
      shiftX: active.direction * remaining * remaining * remaining * 1.7,
      glitch: Math.cos(progress * Math.PI * 0.5),
      // Labels are DOM and cannot ride the shader's shift, so they fade in
      // instead of standing still while the nodes move under them.
      labelOpacity: progress * progress,
    };
  }

  private layoutTransitionRevealAt(now: number): number {
    const active = this.layoutTransition;
    if (active === null) {
      return 1;
    }
    const progress = Math.max(0, (now - active.startMs) / graphLayoutTransitionMs);
    if (progress >= 1) {
      this.layoutTransition = null;
      return 1;
    }
    const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
    return active.from + (1 - active.from) * eased;
  }

  /**
   * Resizing is the only thing a viewport change decides.
   *
   * It never touches fidelity. The fixed profile's own ceilings bound the
   * surfaces, and only a real viewport or device-scale change can reallocate
   * them.
   */
  private applyViewport(viewport: GraphViewport, devicePixelRatio: number): void {
    const surfaceKey = `${viewport.width}x${viewport.height}@${devicePixelRatio}`;
    if (surfaceKey === this.lastSurfaceKey) {
      return;
    }
    this.lastSurfaceKey = surfaceKey;
    this.renderer.resize(viewport.width, viewport.height, devicePixelRatio, this.options.canvas);
  }

  private updateLabels(
    timeSeconds: number,
    viewport: GraphViewport,
    nodes: { readonly from: number; readonly to: number },
    visualCameraWorldY: number,
  ): void {
    if (!this.labelsEnabled) {
      this.clearLabels();
      return;
    }
    let count = this.computeLabelPlacements(timeSeconds, viewport, nodes, visualCameraWorldY);
    if (this.presentation !== "conversation") {
      const hovered = this.view.hovered();
      count = this.filterOverviewLabels(count, timeSeconds, hovered);
      this.applyLabelWidthBudget(viewport);
      this.constrainHoveredTooltip(count, hovered, viewport);
    }
    this.applyLabels(count, viewport);
  }

  private clearLabels(): void {
    this.labels.apply({
      count: 0,
      foldable: this.presentation === "conversation",
      placements: this.placements,
      snapshot: this.snapshot,
    });
    this.labels.applyColumnTitles([]);
  }

  private computeLabelPlacements(
    timeSeconds: number,
    viewport: GraphViewport,
    nodes: { readonly from: number; readonly to: number },
    visualCameraWorldY: number,
  ): number {
    return computeGraphLabelPlacements(
      {
        snapshot: this.snapshot,
        worldY: this.frameWorldY,
        open: this.frameOpen,
        cameraWorldY: visualCameraWorldY,
        timeSeconds,
        viewport,
        hoveredNode: this.view.hovered(),
        visibleFrom: nodes.from,
        visibleTo: nodes.to,
        // Sticky questions belong to the single-thread conversation. In a
        // composition they fabricate a shared header out of unrelated tiles.
        activeTurn:
          this.presentation === "conversation" ? graphActiveTurn(this.snapshot, timeSeconds) : -1,
        reducedMotion: this.reducedMotion,
        directorNodeEnd: this.directorNodeEnd,
        supportingNodeScale: this.supportingNodeScale(),
      },
      this.placements,
    );
  }

  private filterOverviewLabels(
    count: number,
    timeSeconds: number,
    hoveredNode: number | null,
  ): number {
    /*
     * Threads side by side read as shapes, not sentences: labels stay off so
     * the constellation is legible. A small grid lets each thread's freshest
     * change speak briefly. A dense activity grid is quieter still: only the
     * hovered node speaks, so text can never collide with a neighbouring cell.
     */
    if (this.usesActivityNodeGrid()) {
      return this.keepHoveredOverviewLabel(count, hoveredNode);
    }
    const freshestPerTurn = this.freshestOverviewLabels(count, timeSeconds, hoveredNode);
    return this.compactFreshOverviewLabels(count, timeSeconds, hoveredNode, freshestPerTurn);
  }

  private keepHoveredOverviewLabel(count: number, hoveredNode: number | null): number {
    let kept = 0;
    for (let index = 0; index < count; index += 1) {
      const placement = this.placements[index];
      if (placement?.nodeIndex === hoveredNode) {
        this.copyLabelPlacement(index, kept);
        kept += 1;
      }
    }
    return kept;
  }

  private freshestOverviewLabels(
    count: number,
    timeSeconds: number,
    hoveredNode: number | null,
  ): ReadonlyMap<number, { readonly index: number; readonly spokeAt: number }> {
    const freshestPerTurn = new Map<number, { index: number; spokeAt: number }>();
    for (let index = 0; index < count; index += 1) {
      const placement = this.placements[index];
      if (placement === undefined || placement.nodeIndex === hoveredNode) {
        continue;
      }
      const spokeAt = Math.max(
        packedValueAt(this.snapshot.nodes.bornAt, placement.nodeIndex),
        packedValueAt(this.snapshot.nodes.settleAt, placement.nodeIndex) - 1,
      );
      const age = timeSeconds - spokeAt;
      if (age < 0 || age >= temporaryLabelSeconds) {
        continue;
      }
      const turn = packedValueAt(this.snapshot.nodes.turn, placement.nodeIndex);
      const current = freshestPerTurn.get(turn);
      if (current === undefined || spokeAt > current.spokeAt) {
        freshestPerTurn.set(turn, { index, spokeAt });
      }
    }
    return freshestPerTurn;
  }

  private compactFreshOverviewLabels(
    count: number,
    timeSeconds: number,
    hoveredNode: number | null,
    freshestPerTurn: ReadonlyMap<number, { readonly index: number; readonly spokeAt: number }>,
  ): number {
    let kept = 0;
    for (let index = 0; index < count; index += 1) {
      const placement = this.placements[index];
      if (placement === undefined) {
        continue;
      }
      if (placement.nodeIndex === hoveredNode) {
        this.copyLabelPlacement(index, kept);
        kept += 1;
        continue;
      }
      const turn = packedValueAt(this.snapshot.nodes.turn, placement.nodeIndex);
      const freshest = freshestPerTurn.get(turn);
      if (freshest?.index !== index) {
        continue;
      }
      const age = timeSeconds - freshest.spokeAt;
      placement.opacity *= Math.min(1, (temporaryLabelSeconds - age) / temporaryLabelFadeSeconds);
      this.copyLabelPlacement(index, kept);
      kept += 1;
    }
    return kept;
  }

  private applyLabels(count: number, viewport: GraphViewport): void {
    this.labels.apply({
      activityNodesOnly: this.usesActivityNodeGrid(),
      count,
      foldable: this.presentation === "conversation",
      hoveredNode: this.view.hovered(),
      placements: this.placements,
      snapshot: this.snapshot,
      titles: this.columnTitles,
    });
    this.labels.applyColumnTitles(this.columnTitlePlacements(viewport));
  }

  /**
   * Compacts label candidates without aliasing their pooled placement objects.
   * Reassigning an object reference here lets a later frame overwrite several
   * slots at once, which duplicated one hovered label across the DOM pool.
   */
  private copyLabelPlacement(from: number, to: number): void {
    if (from === to) {
      return;
    }
    const source = this.placements[from];
    const target = this.placements[to];
    if (source === undefined || target === undefined) {
      return;
    }
    target.nodeIndex = source.nodeIndex;
    target.x = source.x;
    target.y = source.y;
    target.opacity = source.opacity;
    target.anchor = source.anchor;
    target.sticky = source.sticky;
    target.expanded = source.expanded;
  }

  private usesActivityNodeGrid(): boolean {
    return (
      this.presentation === "grid" &&
      directorGridUsesActivityNodes(this.snapshot.turnCount, this.options.viewportOf())
    );
  }

  /** Supporting grid cells stay subordinate without changing with viewport size. */
  private supportingNodeScale(): number {
    return this.presentation === "grid"
      ? graphNodeHierarchyScale.gridSupporting
      : graphNodeHierarchyScale.director;
  }

  /** Keeps the one contextual card readable at the viewport edges. */
  private constrainHoveredTooltip(
    count: number,
    hoveredNode: number | null,
    viewport: GraphViewport,
  ): void {
    if (hoveredNode === null || this.presentation === "conversation") {
      return;
    }
    const width = Math.min(
      graphTooltipMaxWidthPx,
      Math.max(1, viewport.width - graphTooltipViewportInsetPx * 2),
    );
    const minimumX = graphTooltipViewportInsetPx + width * 0.5;
    const maximumX = viewport.width - graphTooltipViewportInsetPx - width * 0.5;
    for (let index = 0; index < count; index += 1) {
      const placement = this.placements[index];
      if (placement?.nodeIndex !== hoveredNode) {
        continue;
      }
      placement.x =
        maximumX < minimumX
          ? viewport.width * 0.5
          : Math.min(maximumX, Math.max(minimumX, placement.x));
      if (placement.y > viewport.height - graphTooltipEstimatedHeightPx) {
        placement.y = Math.max(
          graphTooltipEstimatedHeightPx * 0.5,
          placement.y - graphTooltipEstimatedHeightPx,
        );
        placement.anchor = "over";
      }
      return;
    }
  }

  /**
   * Bounds every label and title to its column's pitch, so neighbouring
   * threads can never overlap however small the window gets. The budget is a
   * CSS variable the label styles consume; writing it once per frame is a
   * string compare when nothing changed.
   */
  private applyLabelWidthBudget(viewport: GraphViewport): void {
    const fit = graphFitFrame(viewport.width, viewport.height);
    let minimumGap = Number.POSITIVE_INFINITY;
    const lanes: number[] = [];
    for (let turn = 0; turn < this.snapshot.turnCount; turn += 1) {
      const input = packedValueAt(this.snapshot.turns.inputNode, turn);
      lanes.push(packedValueAt(this.snapshot.nodes.lane, input));
    }
    lanes.sort((left, right) => left - right);
    for (let index = 1; index < lanes.length; index += 1) {
      const gap = (lanes[index] ?? 0) - (lanes[index - 1] ?? 0);
      if (gap > 0.001) {
        minimumGap = Math.min(minimumGap, gap);
      }
    }
    const budget = Number.isFinite(minimumGap)
      ? Math.max(0, minimumGap * fit.fitX * 0.5 * viewport.width - 24)
      : 260;
    const value = `${Math.round(budget)}px`;
    if (this.options.labelRoot.style.getPropertyValue("--graph-label-max") !== value) {
      this.options.labelRoot.style.setProperty("--graph-label-max", value);
    }
  }

  /**
   * Where each thread's name sits: over its column's input node, computed by
   * the same node-to-screen projection the labels use, so titles and threads
   * cannot disagree. Columns pin the row just under the bar. In a grid the
   * Director remains in that stable row while worker names stay attached to
   * their tiles through a multi-row grid's bounded viewport projection. A
   * single supporting row shares the Director's stable heading line.
   */
  private columnTitlePlacements(viewport: GraphViewport): readonly GraphColumnTitlePlacement[] {
    if (this.presentation === "conversation" || this.columnTitles.size === 0) {
      return [];
    }
    const fit = graphFitFrame(viewport.width, viewport.height);
    const camera = this.view.visualCamera(fit, viewport);
    const placements: GraphColumnTitlePlacement[] = [];
    for (let turn = 0; turn < this.snapshot.turnCount; turn += 1) {
      const placement = this.columnTitlePlacement(turn, viewport, fit, camera);
      if (placement !== null) {
        placements.push(placement);
      }
    }
    return placements;
  }

  private columnTitlePlacement(
    turn: number,
    viewport: GraphViewport,
    fit: ReturnType<typeof graphFitFrame>,
    camera: number,
  ): GraphColumnTitlePlacement | null {
    const workstreamId = this.snapshot.turnWorkstreamIds[turn];
    if (workstreamId === undefined) {
      return null;
    }
    const text = this.columnTitles.get(workstreamId);
    if (text === undefined) {
      return null;
    }
    const input = packedValueAt(this.snapshot.turns.inputNode, turn);
    const position = graphNodeScreenPosition(
      packedValueAt(this.snapshot.nodes.lane, input),
      packedValueAt(this.frameWorldY, input),
      camera,
      fit,
      viewport,
    );
    const self = workstreamId === this.selfWorkstreamId;
    const pinned = this.columnTitleIsPinned(self);
    const anchorY = pinned ? columnTitleTopPx : this.columnTitleAnchorY(position.y);
    const warped = graphWarpToScreen(position.x, anchorY, viewport.width, viewport.height);
    return {
      key: workstreamId,
      text,
      x: warped.x,
      // A pinned heading row is interface chrome, not scene geometry. Its X
      // follows the warped column, while its baseline remains shared.
      y: pinned ? columnTitleTopPx : warped.y,
      tooltipX: this.columnTitleTooltipX(warped.x, viewport.width),
      self,
      pinned,
      openable: !self && this.canOpenWorkstream(),
    };
  }

  private columnTitleIsPinned(self: boolean): boolean {
    return (
      this.presentation === "columns" ||
      (this.presentation === "grid" && (self || !this.supportingGridHasMultipleRows))
    );
  }

  private columnTitleAnchorY(nodeScreenY: number): number {
    return this.presentation === "grid" ? graphGridTitleAnchorY(nodeScreenY) : 0;
  }

  private columnTitleTooltipX(warpedX: number, viewportWidth: number): number {
    const tooltipHalfWidth = Math.min(
      columnTitleTooltipMaxWidthPx * 0.5,
      Math.max(0, (viewportWidth - columnTitleTooltipViewportInsetPx * 2) * 0.5),
    );
    const minimum = columnTitleTooltipViewportInsetPx + tooltipHalfWidth;
    const maximum = viewportWidth - columnTitleTooltipViewportInsetPx - tooltipHalfWidth;
    return maximum < minimum ? viewportWidth * 0.5 : Math.min(maximum, Math.max(minimum, warpedX));
  }

  private recordFrame(frameStart: number, timing: GraphFrameTiming): void {
    const gpuFrameMs = this.gpuTimer?.poll() ?? null;
    this.sampler.record({
      cpuFrameMs: this.now() - frameStart,
      gpuFrameMs,
      frameDeltaMs: timing.deltaSeconds * 1000,
      marks: this.stopwatch.marks(),
    });
  }

  private decideOutcome(
    ladder: { readonly foldAnimating: boolean; readonly quietUntilSeconds: number },
    timeSeconds: number,
    arrived: boolean,
    hovering: boolean,
  ): GraphFrameOutcome {
    const continueAnimating =
      this.semanticMotionActive(ladder, arrived) ||
      this.transitionMotionActive() ||
      this.interactionMotionActive(ladder, timeSeconds, hovering) ||
      this.fieldMotionActive() ||
      this.cameraMotionActive();
    return continueAnimating ? "continue" : "idle";
  }

  private semanticMotionActive(
    ladder: { readonly foldAnimating: boolean },
    arrived: boolean,
  ): boolean {
    return arrived || ladder.foldAnimating || this.queued.length > 0;
  }

  private transitionMotionActive(): boolean {
    return (
      this.workstreamSwitch !== null ||
      this.layoutTransition !== null ||
      this.overviewSnapshotTransition !== null
    );
  }

  private interactionMotionActive(
    ladder: { readonly quietUntilSeconds: number },
    timeSeconds: number,
    hovering: boolean,
  ): boolean {
    return (
      this.view.elasticActive() ||
      this.directorEdgeDisturbance > 0 ||
      timeSeconds < ladder.quietUntilSeconds ||
      graphHoverNeedsAnimation(this.reducedMotion, hovering, this.hoverAmount)
    );
  }

  private fieldMotionActive(): boolean {
    return (
      graphLoadingFieldNeedsAnimation(this.reducedMotion, this.loading, this.loadingAmount) ||
      this.artifactFieldMotionActive() ||
      graphAmbientFieldNeedsAnimation(this.reducedMotion, this.ambientMotion)
    );
  }

  private artifactFieldMotionActive(): boolean {
    return (
      this.artifactParticleFlowAmount !==
        (this.artifactParticleStyle === "particle-flow" ? 1 : 0) ||
      this.artifactFluidAmount !== (this.artifactParticleStyle === "fluid" ? 1 : 0) ||
      this.artifactSeedX !== this.artifactSeedTargetX ||
      this.artifactSeedY !== this.artifactSeedTargetY
    );
  }

  private cameraMotionActive(): boolean {
    return this.view.camera() !== this.automaticLiveEdgeWorldY && !this.view.isDetached();
  }
}
