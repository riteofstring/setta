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
  GraphFrameSampler,
  GraphFrameStopwatch,
  GraphGpuTimer,
  observeGraphLongTasks,
  type GraphPerformanceSummary,
} from "./graph-instrumentation";
import { GraphLabelLayer } from "./graph-label-layer";
import { checkGraphCanvasPixels, type GraphCanvasPixelCheck } from "./graph-pixel-check";
import { GraphLadderLayout, advanceGraphCamera } from "./graph-ladder-layout";
import {
  computeGraphLabelPlacements,
  graphActiveTurn,
  type GraphLabelPlacement,
} from "./graph-labels";
import {
  GraphQualityController,
  graphReducedMotionProfile,
  graphRefreshPeriodMs,
  graphStartingQualityProfile,
  type GraphQualityTier,
} from "./graph-quality";
import {
  GraphScenePacker,
  graphVisibleEdgeRange,
  graphVisibleNodeRange,
} from "./graph-scene-packer";
import {
  GraphViewController,
  advanceHoverAmount,
  graphNodeAtPointer,
  graphOutcomeAtPointer,
  type GraphScreenPoint,
  type GraphViewport,
  type GraphCameraBounds,
} from "./graph-view-state";
import { graphFitFrame, graphMotionRates } from "./graph-visual-language";
import { packedValueAt } from "../packed-graph-vocabulary";
import type { SemanticGraphPresentation } from "../semantic-graph-packer";

export interface GraphCanvasQuality {
  readonly tier: GraphQualityTier;
  /**
   * The viewport the graph is drawing at. It follows the element's resize
   * observer, which is a frame behind the DOM box, so a measurement that
   * changes the viewport waits on this rather than on the element.
   */
  readonly viewport: GraphViewport;
  readonly devicePixelRatio: number;
  readonly renderScale: number;
  readonly postWidth: number;
  readonly postHeight: number;
  readonly sceneWidth: number;
  readonly sceneHeight: number;
}

export interface DirectorGraphCanvasOptions {
  readonly canvas: HTMLCanvasElement;
  readonly labelRoot: HTMLElement;
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

export class DirectorGraphCanvas {
  private readonly renderer: DirectorGraphRenderer;
  private readonly scheduler: GraphFrameScheduler;
  private readonly layout = new GraphLadderLayout();
  private readonly packer = new GraphScenePacker();
  private readonly view = new GraphViewController();
  private readonly labels: GraphLabelLayer;
  private readonly sampler = new GraphFrameSampler();
  private readonly stopwatch: GraphFrameStopwatch;
  private readonly gpuTimer: GraphGpuTimer;
  private readonly stopLongTasks: () => void;
  private readonly placements: GraphLabelPlacement[] = [];
  private readonly quality: GraphQualityController;
  private readonly now: () => number;
  private readonly ambientMotion: boolean;

  private snapshot: PackedGraphSnapshot;
  private queued: PackedGraphBatch[] = [];
  private pendingPixelChecks: ((check: GraphCanvasPixelCheck) => void)[] = [];
  private reducedMotion: boolean;
  private hoverAmount = 0;
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
  private bounds: GraphCameraBounds = { contentTopWorldY: 0, liveEdgeWorldY: 0 };
  private lastSurfaceKey = "";
  private lastFrameTimestampMs = 0;
  private disposed = false;

  constructor(private readonly options: DirectorGraphCanvasOptions) {
    this.snapshot = emptyPackedGraphSnapshot("");
    this.reducedMotion = options.reducedMotion;
    this.ambientMotion = options.ambientMotion === true;
    this.now = options.now ?? (() => performance.now());
    const viewport = options.viewportOf();
    const profile = this.profileFor();
    this.quality = new GraphQualityController(profile);
    this.renderer = new DirectorGraphRenderer(options.canvas, options.ownerDocument, profile);
    this.renderer.resize(
      viewport.width,
      viewport.height,
      options.devicePixelRatioOf(),
      this.quality.current().renderScale,
      options.canvas,
    );
    this.renderer.prewarm();
    this.labels = new GraphLabelLayer(options.labelRoot, options.ownerDocument, {
      onPillActivated: (nodeIndex) => this.toggleTurnAt(nodeIndex),
    });
    this.stopwatch = new GraphFrameStopwatch(this.now);
    this.gpuTimer = new GraphGpuTimer(
      // The renderer already proved the context exists; reuse it for timing.
      this.renderer.context(),
    );
    this.stopLongTasks = observeGraphLongTasks(this.sampler);
    this.scheduler = new GraphFrameScheduler(options.frameHost ?? defaultFrameHost, (timing) =>
      this.frame(timing),
    );
  }

  /**
   * Replaces the whole graph: a workstream switch, a resync, or a cold replay
   * after restart. Everything incremental resets, because a replacement is not
   * an extension even when it carries the same workstream id — the ladder's
   * turn ranges and the packer's upload ranges both describe the snapshot they
   * were built from, not this one.
   */
  setSnapshot(snapshot: PackedGraphSnapshot): void {
    if (snapshot.workstreamId !== this.snapshot.workstreamId) {
      this.view.reset();
      this.hoverAmount = 0;
      this.arriveAtLiveEdge = true;
    } else {
      this.view.clearNodeFocus();
    }
    this.snapshot = snapshot;
    this.queued = [];
    this.layout.reset();
    this.packer.noteChanged(0, 0);
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
    const decision = this.quality.setProfile(this.profileFor());
    this.renderer.applyProfile(decision.profile);
    // Reduced motion re-derives the profile, so both the tier and the surfaces
    // have to be reapplied rather than only redrawn.
    this.lastSurfaceKey = "";
    this.scheduler.requestFrame();
  }

  setVisible(visible: boolean): void {
    this.scheduler.setVisible(visible);
  }

  /** Wakes the loop after a viewport or layout change. */
  invalidate(): void {
    this.lastSurfaceKey = "";
    this.scheduler.requestFrame();
  }

  pointerMoved(point: GraphScreenPoint): void {
    const hovered = graphNodeAtPointer(this.pointerScene(), point);
    if (this.view.setHovered(hovered)) {
      this.scheduler.requestFrame();
    }
  }

  pointerLeft(): void {
    if (this.view.setHovered(null)) {
      this.scheduler.requestFrame();
    }
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
      if (hit !== null && this.openWorkstreamAt(hit)) {
        return;
      }
      this.view.toggleSelected(hit);
      this.scheduler.requestFrame();
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

  /** Opens the thread a node belongs to. Reports whether there was one to open. */
  private openWorkstreamAt(nodeIndex: number): boolean {
    const turn = packedValueAt(this.snapshot.nodes.turn, nodeIndex);
    const workstreamId = this.snapshot.turnWorkstreamIds[turn];
    if (workstreamId === undefined || this.options.onOpenWorkstream === undefined) {
      return false;
    }
    this.options.onOpenWorkstream(workstreamId);
    return true;
  }

  /** Wheel look-back through the trajectory; live work keeps running. */
  wheeled(deltaYPx: number): void {
    this.view.lookBack(deltaYPx, this.bounds);
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
  setPresentation(presentation: SemanticGraphPresentation): void {
    this.presentation = presentation;
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
    this.gpuTimer.reset();
    this.sampler.reset();
  }

  currentSnapshot(): PackedGraphSnapshot {
    return this.snapshot;
  }

  /**
   * The tier, adaptive scale, and pass sizes a performance report has to state.
   * Derived values would drift from the ones actually in force, because both the
   * tier and the scale move while a sample runs.
   */
  qualityState(): GraphCanvasQuality {
    const decision = this.quality.current();
    const surfaces = this.renderer.surfaceSizes();
    return {
      tier: decision.profile.tier,
      viewport: this.options.viewportOf(),
      devicePixelRatio: this.options.devicePixelRatioOf(),
      renderScale: decision.renderScale,
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
    this.scheduler.stop();
    this.stopLongTasks();
    this.gpuTimer.dispose();
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
    this.view.toggleTurnPin(turn, this.layout.turnOpenness(turn) > 0.5);
    this.scheduler.requestFrame();
  }

  private pointerScene() {
    return {
      snapshot: this.snapshot,
      placedNodeCount: Math.min(this.snapshot.nodeCount, this.layout.placedNodeCount()),
      worldY: this.layout.worldYColumn(),
      open: this.layout.openColumn(),
      cameraWorldY: this.view.camera(),
      timeSeconds: this.options.timeSecondsAt(this.lastFrameTimestampMs),
      viewport: this.options.viewportOf(),
    };
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
    return true;
  }

  private frame(timing: GraphFrameTiming): GraphFrameOutcome {
    const frameStart = this.stopwatch.beginFrame();
    this.lastFrameTimestampMs = timing.timestampMs;
    const timeSeconds = this.options.timeSecondsAt(timing.timestampMs);
    const viewport = this.options.viewportOf();
    const devicePixelRatio = this.options.devicePixelRatioOf();

    this.stopwatch.begin("projection");
    const arrived = this.drainQueue();
    const ladder = this.layout.advance(this.snapshot, {
      timeSeconds,
      deltaSeconds: timing.deltaSeconds,
      pinnedTurns: this.view.pins(),
      reducedMotion: this.reducedMotion,
      alignColumnsToLiveEdge: this.presentation === "columns",
    });
    this.bounds = {
      contentTopWorldY: ladder.contentTopWorldY,
      liveEdgeWorldY: ladder.liveEdgeWorldY,
    };
    this.view.followLiveEdge(
      this.arriveAtLiveEdge
        ? ladder.liveEdgeWorldY
        : advanceGraphCamera(
            this.view.camera(),
            ladder.liveEdgeWorldY,
            timing.deltaSeconds,
            this.reducedMotion,
          ),
    );
    // Every frame, detached included: the content moves under a camera that has
    // not, and a camera outside it draws nothing with no way to say so.
    this.view.clampToContent(this.bounds);
    this.arriveAtLiveEdge = false;
    const hovering = this.view.hovered() !== null;
    this.hoverAmount = advanceHoverAmount(
      this.hoverAmount,
      hovering,
      timing.deltaSeconds,
      graphMotionRates.hover,
      this.reducedMotion,
    );

    this.stopwatch.begin("packing");
    const scene = this.packer.sync(this.snapshot, ladder, {
      from: ladder.dirtyFrom,
      to: ladder.dirtyTo,
    });
    const profile = this.quality.current().profile;
    /*
     * Culling reads worldY as sorted, which it is down one column and is not
     * across several: each column restarts at its own top, so a binary search
     * lands anywhere and drops nodes that are on screen. A composition is
     * bounded by the snapshot budget, so it is drawn whole rather than searched
     * wrongly.
     */
    const nodes =
      ladder.columnCount > 1
        ? { from: 0, to: this.snapshot.nodeCount }
        : graphVisibleNodeRange(
            ladder.worldY,
            this.snapshot.nodeCount,
            this.view.camera(),
            profile.visibleHalfWindow,
          );
    const edges = graphVisibleEdgeRange(this.snapshot.edges.to, this.snapshot.edgeCount, nodes);

    this.stopwatch.begin("upload");
    this.applyViewport(viewport, devicePixelRatio);
    this.renderer.upload(scene);

    this.stopwatch.begin("draw");
    this.gpuTimer.beginFrame();
    this.renderer.render({
      snapshot: this.snapshot,
      scene,
      worldY: ladder.worldY,
      nodes,
      edges,
      view: this.renderView(timeSeconds),
    });
    this.gpuTimer.endFrame();
    this.stopwatch.end();
    this.resolvePixelChecks(viewport);

    this.updateLabels(timeSeconds, viewport, nodes);
    this.recordFrame(frameStart, timing);
    return this.decideOutcome(ladder, timeSeconds, arrived, hovering);
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

  private renderView(timeSeconds: number): GraphRenderView {
    const hovered = this.view.hovered();
    return {
      timeSeconds,
      cameraWorldY: this.view.camera(),
      hoverLaneX: hovered === null ? 0 : packedValueAt(this.snapshot.nodes.lane, hovered),
      hoverWorldY: hovered === null ? 0 : this.layout.nodeWorldY(hovered),
      hoverAmount: this.hoverAmount,
      shiftX: 0,
      glitch: 0,
      reducedMotion: this.reducedMotion,
    };
  }

  /**
   * Resizing is the only thing a viewport change decides.
   *
   * It does not touch the tier. The tier is not chosen from how many pixels the
   * surface has — see `graphStartingQualityProfile` — so re-deriving it here
   * would only throw away a tier the graph had earned from measured GPU time,
   * and pay for a geometry rebuild, every time the window moved a pixel.
   *
   * The surface key covers the viewport, the tier, and the scale, so an
   * adaptive step in either knob reaches the framebuffers on the next frame
   * instead of waiting for a viewport change to carry it.
   */
  private applyViewport(viewport: GraphViewport, devicePixelRatio: number): void {
    const current = this.quality.current();
    const surfaceKey =
      `${viewport.width}x${viewport.height}@${devicePixelRatio}` +
      `|${current.profile.tier}|${current.renderScale}`;
    if (surfaceKey === this.lastSurfaceKey) {
      return;
    }
    this.lastSurfaceKey = surfaceKey;
    this.renderer.resize(
      viewport.width,
      viewport.height,
      devicePixelRatio,
      current.renderScale,
      this.options.canvas,
    );
  }

  private updateLabels(
    timeSeconds: number,
    viewport: GraphViewport,
    nodes: { readonly from: number; readonly to: number },
  ): void {
    const count = computeGraphLabelPlacements(
      {
        snapshot: this.snapshot,
        worldY: this.layout.worldYColumn(),
        open: this.layout.openColumn(),
        cameraWorldY: this.view.camera(),
        timeSeconds,
        viewport,
        hoveredNode: this.view.hovered(),
        visibleFrom: nodes.from,
        visibleTo: nodes.to,
        activeTurn: graphActiveTurn(this.snapshot, timeSeconds),
        reducedMotion: this.reducedMotion,
      },
      this.placements,
    );
    this.labels.apply(this.snapshot, this.placements, count);
  }

  private recordFrame(frameStart: number, timing: GraphFrameTiming): void {
    const gpuFrameMs = this.gpuTimer.poll();
    const refreshPeriodMs = graphRefreshPeriodMs(timing.shortestDeltaMs);
    this.sampler.setFrameBudgetMs(refreshPeriodMs);
    if (gpuFrameMs !== null) {
      const decision = this.quality.sample(gpuFrameMs, refreshPeriodMs);
      this.sampler.recordQuality(decision.renderScale, decision.tierChanged);
      if (decision.tierChanged) {
        this.renderer.applyProfile(decision.profile);
      }
      // The surfaces follow both knobs; `applyViewport` resizes on the next
      // frame when either moved.
    }
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
    if (arrived || ladder.foldAnimating || this.queued.length > 0) {
      return "continue";
    }
    if (timeSeconds < ladder.quietUntilSeconds) {
      return "continue";
    }
    if (graphHoverNeedsAnimation(this.reducedMotion, hovering, this.hoverAmount)) {
      return "continue";
    }
    if (graphAmbientFieldNeedsAnimation(this.reducedMotion, this.ambientMotion)) {
      return "continue";
    }
    if (this.view.camera() !== this.layout.liveEdge() && !this.view.isDetached()) {
      return "continue";
    }
    return "idle";
  }
}
