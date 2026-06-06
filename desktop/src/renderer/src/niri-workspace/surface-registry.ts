import { createDefaultSurfaceAdapter, SnapshotSurfaceAdapter } from "./surface-adapters";
import type {
  CanvasSurfaceStats,
  FreezeReason,
  GitGraphSurfaceStats,
  NiriPane,
  PaneRenderItem,
  Rect,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
  TerminalSurfaceStats,
} from "./types";

export type SurfaceAdapterFactory = (pane: NiriPane) => SurfaceAdapter;

interface SurfaceRecord {
  adapter: SurfaceAdapter;
  pane: NiriPane;
  snapshotAdapter: SnapshotSurfaceAdapter;
}

interface HostRecord {
  adapter: SurfaceAdapter;
  surfaceId: SurfaceId;
}

export class SurfaceRegistry {
  private readonly hostRecords = new Map<HTMLElement, HostRecord>();
  private readonly metricAdapters = new Set<SurfaceAdapter>();
  private readonly records = new Map<SurfaceId, SurfaceRecord>();

  constructor(
    panes: readonly NiriPane[],
    private readonly adapterFactory: SurfaceAdapterFactory = createDefaultSurfaceAdapter,
  ) {
    for (const pane of panes) {
      this.records.set(pane.surfaceId, {
        adapter: this.adapterFactory(pane),
        pane,
        snapshotAdapter: new SnapshotSurfaceAdapter(pane),
      });
    }
  }

  adapterFor(surfaceId: SurfaceId): SurfaceAdapter {
    return this.requireRecord(surfaceId).adapter;
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

    const adapters = new Set<SurfaceAdapter>();
    for (const record of this.hostRecords.values()) {
      adapters.add(record.adapter);
    }

    for (const adapter of adapters) {
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

    for (const adapter of this.metricAdapters) {
      addGitGraphStats(aggregate, adapter.getGitGraphStats?.());
    }

    return {
      completed: aggregate.completed,
      liveGraphPaneCount: aggregate.liveGraphPaneCount,
      progress: aggregate.statsCount > 0 ? aggregate.totalProgress / aggregate.statsCount : 0,
      renderedEdges: aggregate.renderedEdges,
      renderedNodes: aggregate.renderedNodes,
      renderer: aggregate.renderer,
      workerBatches: aggregate.workerBatches,
      workerPending: aggregate.workerPending,
    };
  }

  terminalStats(): TerminalSurfaceStats {
    let dirtyRows = 0;
    let droppedOutputChunks = 0;
    let liveTerminalRendererCount = 0;
    let pendingOutputChunks = 0;
    let renderedRows = 0;
    let scrollbackRows = 0;

    for (const adapter of this.metricAdapters) {
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

    return {
      dirtyRows,
      droppedOutputChunks,
      liveTerminalRendererCount,
      pendingOutputChunks,
      renderedRows,
      scrollbackRows,
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
  }

  syncHost(host: HTMLElement, item: PaneRenderItem): void {
    const rect: Rect = {
      height: item.height,
      width: item.width,
      x: item.x,
      y: item.y,
    };
    const record = this.requireRecord(item.surfaceId);
    const adapter = this.adapterForRuntimeState(record, item.runtimeState);
    const existing = this.hostRecords.get(host);

    if (!existing || existing.adapter !== adapter) {
      if (existing) {
        existing.adapter.setVisible(false);
        existing.adapter.unmount();
      }
      adapter.mount(host);
      this.metricAdapters.add(adapter);
      this.hostRecords.set(host, {
        adapter,
        surfaceId: item.surfaceId,
      });
    }

    this.syncRuntimeLifecycle(record.adapter, item);
    adapter.setVisible(item.visible && item.runtimeState !== "hidden");
    adapter.setFocused(item.focused);
    adapter.setViewport(rect, existing ? "frame" : "mount");
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
    this.metricAdapters.clear();
  }

  private adapterForRuntimeState(
    record: SurfaceRecord,
    runtimeState: PaneRenderItem["runtimeState"],
  ): SurfaceAdapter {
    switch (runtimeState) {
      case "destroyed":
      case "hidden":
      case "live-throttled":
      case "snapshot":
        return record.snapshotAdapter;
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

  private syncRuntimeLifecycle(adapter: SurfaceAdapter, item: PaneRenderItem): void {
    switch (item.runtimeState) {
      case "destroyed":
        adapter.freeze("teardown");
        adapter.destroy();
        return;
      case "hidden":
        adapter.setVisible(false);
        adapter.freeze("hidden");
        return;
      case "live":
        adapter.setVisible(item.visible);
        adapter.resume(item.focused ? "focused" : "visible");
        return;
      case "live-throttled":
        adapter.setVisible(false);
        adapter.freeze("runtime-policy");
        return;
      case "snapshot":
        adapter.setVisible(false);
        adapter.freeze("snapshot");
        return;
      default:
        assertNever(item.runtimeState);
    }
  }
}

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

function isUntouchedGitGraphStats(stats: GitGraphSurfaceStats): boolean {
  return stats.renderedNodes === 0 && stats.liveGraphPaneCount === 0 && !stats.workerPending;
}
