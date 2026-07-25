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
import { coalescePackedGraphBatches } from "../packed-graph-burst";
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
import { GraphLadderLayout, advanceGraphCamera } from "./graph-ladder-layout";
import {
  computeGraphLabelPlacements,
  graphActiveTurn,
  type GraphLabelPlacement,
} from "./graph-labels";
import {
  GraphQualityController,
  graphQualityForViewport,
  graphReducedMotionProfile,
  graphRefreshPeriodMs,
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
} from "./graph-view-state";
import { graphMotionRates } from "./graph-visual-language";
import { packedValueAt } from "../packed-graph-vocabulary";

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
  /** Injected for tests and for a harness that steps frames deterministically. */
  readonly frameHost?: GraphFrameSchedulerHost;
  readonly now?: () => number;
}

const defaultFrameHost: GraphFrameSchedulerHost = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

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

  private snapshot: PackedGraphSnapshot;
  private queued: PackedGraphBatch[] = [];
  private reducedMotion: boolean;
  private hoverAmount = 0;
  private lastViewportKey = "";
  private lastFrameTimestampMs = 0;
  private disposed = false;

  constructor(private readonly options: DirectorGraphCanvasOptions) {
    this.snapshot = emptyPackedGraphSnapshot("");
    this.reducedMotion = options.reducedMotion;
    this.now = options.now ?? (() => performance.now());
    const viewport = options.viewportOf();
    const profile = this.profileFor(viewport, options.devicePixelRatioOf());
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
      onOutcomeActivated: (nodeIndex) => this.toggleTurnAt(nodeIndex),
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

  /** Replaces the whole graph, e.g. when the selected workstream changes. */
  setSnapshot(snapshot: PackedGraphSnapshot): void {
    if (snapshot.workstreamId !== this.snapshot.workstreamId) {
      this.view.reset();
      this.hoverAmount = 0;
    }
    this.snapshot = snapshot;
    this.queued = [];
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
    const viewport = this.options.viewportOf();
    const decision = this.quality.setProfile(
      this.profileFor(viewport, this.options.devicePixelRatioOf()),
    );
    this.renderer.applyProfile(decision.profile);
    this.lastViewportKey = "";
    this.scheduler.requestFrame();
  }

  setVisible(visible: boolean): void {
    this.scheduler.setVisible(visible);
  }

  /** Wakes the loop after a viewport or layout change. */
  invalidate(): void {
    this.lastViewportKey = "";
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
    const outcome = graphOutcomeAtPointer(scene, point);
    if (outcome !== null) {
      this.toggleTurnAt(outcome);
      return;
    }
    this.view.toggleSelected(graphNodeAtPointer(scene, point));
    this.scheduler.requestFrame();
  }

  /** Wheel look-back through the trajectory; live work keeps running. */
  wheeled(deltaYPx: number): void {
    this.view.lookBack(deltaYPx, this.layout.liveEdge());
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
      this.scheduler.requestFrame();
    }
  }

  performanceSummary(): GraphPerformanceSummary {
    return this.sampler.summary();
  }

  resetPerformanceSampling(): void {
    this.sampler.reset();
  }

  currentSnapshot(): PackedGraphSnapshot {
    return this.snapshot;
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

  private profileFor(viewport: GraphViewport, devicePixelRatio: number) {
    const profile = graphQualityForViewport(viewport.width, viewport.height, devicePixelRatio);
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
    });
    this.view.followLiveEdge(
      advanceGraphCamera(
        this.view.camera(),
        ladder.liveEdgeWorldY,
        timing.deltaSeconds,
        this.reducedMotion,
      ),
    );
    const hovering = this.view.hovered() !== null;
    this.hoverAmount = advanceHoverAmount(
      this.hoverAmount,
      hovering,
      timing.deltaSeconds,
      graphMotionRates.hover,
    );

    this.stopwatch.begin("packing");
    const scene = this.packer.sync(this.snapshot, ladder, {
      from: ladder.dirtyFrom,
      to: ladder.dirtyTo,
    });
    const profile = this.quality.current().profile;
    const nodes = graphVisibleNodeRange(
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

    this.updateLabels(timeSeconds, viewport, nodes);
    this.recordFrame(frameStart, timing);
    return this.decideOutcome(ladder, timeSeconds, arrived, hovering);
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

  private applyViewport(viewport: GraphViewport, devicePixelRatio: number): void {
    const key = `${viewport.width}x${viewport.height}@${devicePixelRatio}`;
    if (key === this.lastViewportKey) {
      return;
    }
    this.lastViewportKey = key;
    const decision = this.quality.setProfile(this.profileFor(viewport, devicePixelRatio));
    if (decision.tierChanged) {
      this.renderer.applyProfile(decision.profile);
    }
    this.renderer.resize(
      viewport.width,
      viewport.height,
      devicePixelRatio,
      decision.renderScale,
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
        this.lastViewportKey = "";
      }
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
    if (hovering || this.hoverAmount > 0) {
      return "continue";
    }
    if (this.view.camera() !== this.layout.liveEdge() && !this.view.isDetached()) {
      return "continue";
    }
    return "idle";
  }
}
