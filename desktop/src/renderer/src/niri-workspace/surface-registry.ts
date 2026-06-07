import {
  createDefaultSurfaceAdapter,
  SnapshotSurfaceAdapter,
  type SnapshotSurfaceAdapterOptions,
} from "./surface-adapters";
import type {
  CanvasSurfaceStats,
  FreezeReason,
  GitGraphSurfaceStats,
  NiriPane,
  PaneRenderItem,
  Rect,
  ResizePhase,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
  TerminalSurfaceStats,
} from "./types";

export type SurfaceAdapterFactory = (pane: NiriPane) => SurfaceAdapter;

export interface SurfaceRegistryOptions {
  snapshotAdapter?: SnapshotSurfaceAdapterOptions;
}

interface SurfaceRecord {
  adapter: SurfaceAdapter;
  pane: NiriPane;
  snapshotAdapter: SnapshotSurfaceAdapter;
}

interface HostRecord {
  adapter: SurfaceAdapter;
  focused: boolean | null;
  runtimeState: PaneRenderItem["runtimeState"] | null;
  surfaceId: SurfaceId;
  viewport: Rect | null;
  visible: boolean | null;
}

interface ViewportSyncContext {
  defaultReason: "frame" | "mount";
  hostRecord: HostRecord;
  item: PaneRenderItem;
  options: SurfaceSyncOptions;
  stats: SurfaceViewportSyncStats;
}

export interface SurfaceViewportSyncStats {
  browserViewportWrites: number;
  canvasViewportWrites: number;
  deferredHeavyViewportWrites: number;
  gitGraphViewportWrites: number;
  heavyViewportWrites: number;
  surfaceViewportWrites: number;
  terminalViewportWrites: number;
}

export interface SurfaceSyncOptions {
  resizePhase: ResizePhase;
}

export class SurfaceRegistry {
  private readonly hostBySurfaceId = new Map<SurfaceId, HTMLElement>();
  private readonly hostRecords = new Map<HTMLElement, HostRecord>();
  private latestGitGraphActivity = emptyGitGraphStats();
  private latestTerminalActivity = emptyTerminalStats();
  private readonly records = new Map<SurfaceId, SurfaceRecord>();

  constructor(
    panes: readonly NiriPane[],
    private readonly adapterFactory: SurfaceAdapterFactory = createDefaultSurfaceAdapter,
    private readonly options: SurfaceRegistryOptions = {},
  ) {
    for (const pane of panes) {
      this.records.set(pane.surfaceId, {
        adapter: this.adapterFactory(pane),
        pane,
        snapshotAdapter: new SnapshotSurfaceAdapter(pane, this.options.snapshotAdapter),
      });
    }
  }

  adapterFor(surfaceId: SurfaceId): SurfaceAdapter {
    return this.requireRecord(surfaceId).adapter;
  }

  ensurePane(pane: NiriPane): void {
    if (this.records.has(pane.surfaceId)) {
      return;
    }
    this.records.set(pane.surfaceId, {
      adapter: this.adapterFactory(pane),
      pane,
      snapshotAdapter: new SnapshotSurfaceAdapter(pane, this.options.snapshotAdapter),
    });
  }

  syncPanes(panes: readonly NiriPane[]): void {
    const nextSurfaceIds = new Set(panes.map((pane) => pane.surfaceId));
    for (const [surfaceId, record] of [...this.records]) {
      if (nextSurfaceIds.has(surfaceId)) {
        continue;
      }
      const host = this.hostBySurfaceId.get(surfaceId);
      if (host) {
        this.releaseHost(host, "teardown");
      }
      record.adapter.freeze("teardown");
      record.adapter.destroy();
      record.snapshotAdapter.destroy();
      this.records.delete(surfaceId);
    }
    for (const pane of panes) {
      this.ensurePane(pane);
    }
  }

  liveAdapterCountByKind(kind: SurfaceKind): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.adapter.kind === kind) {
        count += 1;
      }
    }
    return count;
  }

  canvasStats(): CanvasSurfaceStats {
    let drawCalls = 0;
    let farZoomSimplified = false;
    let gpuMemoryEstimateBytes = 0;
    let hasGpuMemoryEstimate = false;
    let liveCanvasPaneCount = 0;
    let renderedFrames = 0;

    for (const adapter of this.currentHostAdapters()) {
      const stats = adapter.getCanvasStats?.();
      if (!stats) {
        continue;
      }
      drawCalls += stats.drawCalls;
      farZoomSimplified = farZoomSimplified || stats.farZoomSimplified;
      liveCanvasPaneCount += stats.liveCanvasPaneCount;
      renderedFrames += stats.renderedFrames;
      if (stats.gpuMemoryEstimateBytes !== null) {
        gpuMemoryEstimateBytes += stats.gpuMemoryEstimateBytes;
        hasGpuMemoryEstimate = true;
      }
    }

    return {
      drawCalls,
      farZoomSimplified,
      gpuMemoryEstimateBytes: hasGpuMemoryEstimate ? gpuMemoryEstimateBytes : null,
      liveCanvasPaneCount,
      renderedFrames,
    };
  }

  gitGraphStats(): GitGraphSurfaceStats {
    const aggregate = emptyGitGraphAggregate();

    for (const adapter of this.currentHostAdapters()) {
      addGitGraphStats(aggregate, adapter.getGitGraphStats?.());
    }

    const stats = {
      completed: aggregate.completed,
      liveGraphPaneCount: aggregate.liveGraphPaneCount,
      progress: aggregate.statsCount > 0 ? aggregate.totalProgress / aggregate.statsCount : 0,
      renderedEdges: aggregate.renderedEdges,
      renderedNodes: aggregate.renderedNodes,
      renderer: aggregate.renderer,
      workerBatches: aggregate.workerBatches,
      workerPending: aggregate.workerPending,
    };
    if (gitGraphStatsHaveActivity(stats)) {
      this.latestGitGraphActivity = stats;
      return stats;
    }
    return {
      ...this.latestGitGraphActivity,
      liveGraphPaneCount: 0,
      workerPending: false,
    };
  }

  terminalStats(): TerminalSurfaceStats {
    let dirtyRows = 0;
    let droppedOutputChunks = 0;
    let liveTerminalRendererCount = 0;
    let pendingOutputChunks = 0;
    let renderedRows = 0;
    let scrollbackRows = 0;

    for (const adapter of this.currentHostAdapters()) {
      const stats = adapter.getTerminalStats?.();
      if (!stats) {
        continue;
      }
      dirtyRows += stats.dirtyRows;
      droppedOutputChunks += stats.droppedOutputChunks;
      liveTerminalRendererCount += stats.liveTerminalRendererCount;
      pendingOutputChunks += stats.pendingOutputChunks;
      renderedRows += stats.renderedRows;
      scrollbackRows += stats.scrollbackRows;
    }

    const stats = {
      dirtyRows,
      droppedOutputChunks,
      liveTerminalRendererCount,
      pendingOutputChunks,
      renderedRows,
      scrollbackRows,
    };
    if (terminalStatsHaveActivity(stats)) {
      this.latestTerminalActivity = stats;
      return stats;
    }
    return {
      ...this.latestTerminalActivity,
      liveTerminalRendererCount: 0,
      pendingOutputChunks: 0,
    };
  }

  releaseHost(host: HTMLElement, reason: FreezeReason = "hidden"): void {
    const hostRecord = this.hostRecords.get(host);
    if (!hostRecord) {
      return;
    }
    hostRecord.adapter.setVisible(false);
    hostRecord.adapter.freeze(reason);
    hostRecord.adapter.unmount();
    this.hostRecords.delete(host);
    this.clearSurfaceHost(hostRecord.surfaceId, host);
  }

  syncHost(
    host: HTMLElement,
    item: PaneRenderItem,
    options: SurfaceSyncOptions,
  ): SurfaceViewportSyncStats {
    const rect: Rect = {
      height: item.height,
      width: item.width,
      x: item.x,
      y: item.y,
    };
    const record = this.requireRecord(item.surfaceId);
    const adapter = this.adapterForRuntimeState(record, item.runtimeState);
    const existing = this.hostRecords.get(host);
    const mountedNewAdapter = !existing || existing.adapter !== adapter;
    const stats = emptySurfaceViewportSyncStats();

    if (mountedNewAdapter) {
      if (adapter === record.snapshotAdapter && existing) {
        record.snapshotAdapter.captureTexture(host);
      }
      if (existing) {
        this.unmountHostRecord(host, existing);
      }
      this.detachPreviousHostForSurface(item.surfaceId, host, adapter);
      adapter.mount(host);
      this.hostRecords.set(host, {
        adapter,
        focused: null,
        runtimeState: null,
        surfaceId: item.surfaceId,
        viewport: null,
        visible: null,
      });
      this.hostBySurfaceId.set(item.surfaceId, host);
    }

    const hostRecord = this.hostRecords.get(host);
    if (!hostRecord) {
      throw new Error(`missing niri surface host record for ${item.surfaceId}`);
    }

    this.syncRuntimeLifecycle(record.adapter, item, hostRecord);
    this.syncVisibility(adapter, item, hostRecord);
    this.syncFocus(adapter, item, hostRecord);
    this.syncViewport(adapter, rect, {
      defaultReason: mountedNewAdapter ? "mount" : "frame",
      hostRecord,
      item,
      options,
      stats,
    });
    adapter.syncFrame?.();
    return stats;
  }

  teardown(): void {
    for (const host of [...this.hostRecords.keys()]) {
      this.releaseHost(host, "teardown");
    }
    for (const record of this.records.values()) {
      record.adapter.freeze("teardown");
      record.snapshotAdapter.freeze();
    }
    this.hostRecords.clear();
    this.hostBySurfaceId.clear();
    this.latestGitGraphActivity = emptyGitGraphStats();
    this.latestTerminalActivity = emptyTerminalStats();
  }

  private currentHostAdapters(): Set<SurfaceAdapter> {
    const adapters = new Set<SurfaceAdapter>();
    for (const record of this.hostRecords.values()) {
      adapters.add(record.adapter);
    }
    return adapters;
  }

  private clearSurfaceHost(surfaceId: SurfaceId, host: HTMLElement): void {
    if (this.hostBySurfaceId.get(surfaceId) === host) {
      this.hostBySurfaceId.delete(surfaceId);
    }
  }

  private detachPreviousHostForSurface(
    surfaceId: SurfaceId,
    nextHost: HTMLElement,
    adapter: SurfaceAdapter,
  ): void {
    const previousHost = this.hostBySurfaceId.get(surfaceId);
    if (!previousHost || previousHost === nextHost) {
      return;
    }

    const previousRecord = this.hostRecords.get(previousHost);
    if (!previousRecord) {
      this.hostBySurfaceId.delete(surfaceId);
      return;
    }

    if (previousRecord.adapter !== adapter) {
      this.unmountHostRecord(previousHost, previousRecord);
      return;
    }

    previousHost.replaceChildren();
    delete previousHost.dataset.browserRuntimeState;
    delete previousHost.dataset.surfaceFocused;
    delete previousHost.dataset.surfaceId;
    delete previousHost.dataset.surfaceKind;
    delete previousHost.dataset.surfaceViewport;
    delete previousHost.dataset.surfaceVisible;
    delete previousHost.dataset.viewportReason;
    previousHost.removeAttribute?.("data-freeze-reason");
    previousHost.removeAttribute?.("data-resume-reason");
    this.hostRecords.delete(previousHost);
    this.hostBySurfaceId.delete(surfaceId);
  }

  private unmountHostRecord(host: HTMLElement, hostRecord: HostRecord): void {
    hostRecord.adapter.setVisible(false);
    hostRecord.adapter.unmount();
    this.hostRecords.delete(host);
    this.clearSurfaceHost(hostRecord.surfaceId, host);
  }

  private adapterForRuntimeState(
    record: SurfaceRecord,
    runtimeState: PaneRenderItem["runtimeState"],
  ): SurfaceAdapter {
    switch (runtimeState) {
      case "destroyed":
      case "hidden":
        return record.snapshotAdapter;
      case "snapshot":
        return record.adapter.kind === "browser" ? record.adapter : record.snapshotAdapter;
      case "live-throttled":
        return record.adapter.kind === "browser" || isTerminalSurfaceKind(record.adapter.kind)
          ? record.adapter
          : record.snapshotAdapter;
      case "live":
        return record.adapter;
      default:
        assertNever(runtimeState);
    }
  }

  private requireRecord(surfaceId: SurfaceId): SurfaceRecord {
    const record = this.records.get(surfaceId);
    if (!record) {
      throw new Error(`missing niri surface adapter for ${surfaceId}`);
    }
    return record;
  }

  private syncRuntimeLifecycle(
    adapter: SurfaceAdapter,
    item: PaneRenderItem,
    hostRecord: HostRecord,
  ): void {
    const focusedChanged = hostRecord.focused !== item.focused;
    if (hostRecord.runtimeState === item.runtimeState && !focusedChanged) {
      return;
    }

    switch (item.runtimeState) {
      case "destroyed":
        adapter.freeze("teardown");
        adapter.destroy();
        return;
      case "hidden":
        adapter.freeze("hidden");
        break;
      case "live":
        adapter.resume(item.focused ? "focused" : "visible");
        break;
      case "live-throttled":
        adapter.freeze("runtime-policy");
        break;
      case "snapshot":
        adapter.freeze("snapshot");
        break;
      default:
        assertNever(item.runtimeState);
    }
    hostRecord.runtimeState = item.runtimeState;
  }

  private syncVisibility(
    adapter: SurfaceAdapter,
    item: PaneRenderItem,
    hostRecord: HostRecord,
  ): void {
    const visible = item.visible && item.runtimeState !== "hidden";
    if (hostRecord.visible === visible) {
      return;
    }
    adapter.setVisible(visible);
    hostRecord.visible = visible;
  }

  private syncFocus(adapter: SurfaceAdapter, item: PaneRenderItem, hostRecord: HostRecord): void {
    if (hostRecord.focused === item.focused) {
      return;
    }
    adapter.setFocused(item.focused);
    hostRecord.focused = item.focused;
  }

  private syncViewport(
    adapter: SurfaceAdapter,
    rect: Rect,
    { defaultReason, hostRecord, item, options, stats }: ViewportSyncContext,
  ): void {
    const reason = viewportSyncReason(
      adapter.kind,
      defaultReason,
      item.moving,
      options.resizePhase,
    );
    if (!viewportSyncRequired(reason, hostRecord.viewport, rect)) {
      return;
    }
    if (viewportSyncDeferred(adapter.kind, reason, options.resizePhase)) {
      stats.deferredHeavyViewportWrites += 1;
      return;
    }

    adapter.setViewport(rect, reason);
    hostRecord.viewport = { ...rect };
    recordViewportWrite(adapter.kind, stats);
  }
}

type SurfaceViewportSyncReason = "frame" | "mount" | "movement-active" | "resize" | "resize-active";

function assertNever(value: never): never {
  throw new Error(`Unhandled niri surface registry value: ${String(value)}`);
}

interface GitGraphStatsAggregate {
  completed: boolean;
  liveGraphPaneCount: number;
  renderedEdges: number;
  renderedNodes: number;
  renderer: GitGraphSurfaceStats["renderer"];
  statsCount: number;
  totalProgress: number;
  workerBatches: number;
  workerPending: boolean;
}

function addGitGraphStats(
  aggregate: GitGraphStatsAggregate,
  stats: GitGraphSurfaceStats | undefined,
): void {
  if (!stats || isUntouchedGitGraphStats(stats)) {
    return;
  }
  aggregate.completed = aggregate.completed || stats.completed;
  aggregate.liveGraphPaneCount += stats.liveGraphPaneCount;
  aggregate.renderedEdges += stats.renderedEdges;
  aggregate.renderedNodes += stats.renderedNodes;
  aggregate.renderer = aggregate.renderer ?? stats.renderer;
  aggregate.statsCount += 1;
  aggregate.totalProgress += stats.progress;
  aggregate.workerBatches += stats.workerBatches;
  aggregate.workerPending = aggregate.workerPending || stats.workerPending;
}

function emptyGitGraphAggregate(): GitGraphStatsAggregate {
  return {
    completed: false,
    liveGraphPaneCount: 0,
    renderedEdges: 0,
    renderedNodes: 0,
    renderer: null,
    statsCount: 0,
    totalProgress: 0,
    workerBatches: 0,
    workerPending: false,
  };
}

function emptyGitGraphStats(): GitGraphSurfaceStats {
  return {
    completed: false,
    liveGraphPaneCount: 0,
    progress: 0,
    renderedEdges: 0,
    renderedNodes: 0,
    renderer: null,
    workerBatches: 0,
    workerPending: false,
  };
}

function isUntouchedGitGraphStats(stats: GitGraphSurfaceStats): boolean {
  return !gitGraphStatsHaveActivity(stats);
}

function gitGraphStatsHaveActivity(stats: GitGraphSurfaceStats): boolean {
  return (
    stats.liveGraphPaneCount > 0 ||
    stats.renderedEdges > 0 ||
    stats.renderedNodes > 0 ||
    stats.renderer !== null ||
    stats.workerBatches > 0 ||
    stats.workerPending
  );
}

function emptyTerminalStats(): TerminalSurfaceStats {
  return {
    dirtyRows: 0,
    droppedOutputChunks: 0,
    liveTerminalRendererCount: 0,
    pendingOutputChunks: 0,
    renderedRows: 0,
    scrollbackRows: 0,
  };
}

function terminalStatsHaveActivity(stats: TerminalSurfaceStats): boolean {
  return (
    stats.dirtyRows > 0 ||
    stats.droppedOutputChunks > 0 ||
    stats.liveTerminalRendererCount > 0 ||
    stats.pendingOutputChunks > 0 ||
    stats.renderedRows > 0 ||
    stats.scrollbackRows > 0
  );
}

function emptySurfaceViewportSyncStats(): SurfaceViewportSyncStats {
  return {
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
  };
}

function recordViewportWrite(kind: SurfaceKind, stats: SurfaceViewportSyncStats): void {
  stats.surfaceViewportWrites += 1;
  if (resizeDefersSurfaceViewport(kind)) {
    stats.heavyViewportWrites += 1;
  }
  if (kind === "browser") {
    stats.browserViewportWrites += 1;
  } else if (isCanvasSurfaceKind(kind)) {
    stats.canvasViewportWrites += 1;
  } else if (kind === "git-graph") {
    stats.gitGraphViewportWrites += 1;
  } else if (isTerminalSurfaceKind(kind)) {
    stats.terminalViewportWrites += 1;
  }
}

function resizeDefersSurfaceViewport(kind: SurfaceKind): boolean {
  return (
    kind === "fake-canvas" ||
    kind === "fake-heavy-dom" ||
    kind === "fake-long-chat" ||
    kind === "fake-terminal" ||
    kind === "git-graph" ||
    kind === "pixi-canvas" ||
    kind === "terminal"
  );
}

function viewportSyncDeferred(
  kind: SurfaceKind,
  reason: SurfaceViewportSyncReason,
  resizePhase: ResizePhase,
): boolean {
  return resizePhase === "active" && reason !== "mount" && resizeDefersSurfaceViewport(kind);
}

function viewportSyncReason(
  kind: SurfaceKind,
  defaultReason: "frame" | "mount",
  moving: boolean,
  resizePhase: ResizePhase,
): SurfaceViewportSyncReason {
  if (kind === "browser" && resizePhase === "active" && defaultReason !== "mount") {
    return "resize-active";
  }
  if (kind === "browser" && moving && defaultReason !== "mount") {
    return "movement-active";
  }
  if (resizePhase === "settled") {
    return "resize";
  }
  return defaultReason;
}

function viewportSyncRequired(
  reason: SurfaceViewportSyncReason,
  previousRect: Rect | null,
  nextRect: Rect,
): boolean {
  return (
    reason === "mount" || reason === "resize" || !previousRect || !sameRect(previousRect, nextRect)
  );
}

function isCanvasSurfaceKind(kind: SurfaceKind): boolean {
  return kind === "fake-canvas" || kind === "pixi-canvas";
}

function isTerminalSurfaceKind(kind: SurfaceKind): boolean {
  return kind === "terminal" || kind === "fake-terminal";
}

function sameRect(left: Rect, right: Rect): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
