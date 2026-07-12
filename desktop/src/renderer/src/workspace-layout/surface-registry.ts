import {
  createDefaultSurfaceAdapter,
  SnapshotSurfaceAdapter,
  type SnapshotSurfaceAdapterOptions,
} from "./surface-adapters";
import type {
  FreezeReason,
  WorkspacePane,
  PaneRenderItem,
  Rect,
  ResizePhase,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
  SurfaceSnapshotFreshness,
  SurfaceSnapshotMetricsSink,
} from "./types";

export type SurfaceAdapterFactory = (pane: WorkspacePane) => SurfaceAdapter;

export interface SurfaceRegistryOptions {
  metrics?: SurfaceSnapshotMetricsSink;
  snapshotAdapter?: SnapshotSurfaceAdapterOptions;
}

interface SurfaceRecord {
  adapter: SurfaceAdapter;
  pane: WorkspacePane;
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
  deferredHeavyViewportWrites: number;
  heavyViewportWrites: number;
  surfaceViewportWrites: number;
}

export interface SurfaceSyncOptions {
  resizePhase: ResizePhase;
}

export class SurfaceRegistry {
  private readonly hostBySurfaceId = new Map<SurfaceId, HTMLElement>();
  private readonly hostRecords = new Map<HTMLElement, HostRecord>();
  private readonly records = new Map<SurfaceId, SurfaceRecord>();

  constructor(
    panes: readonly WorkspacePane[],
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

  ensurePane(pane: WorkspacePane): void {
    if (this.records.has(pane.surfaceId)) {
      return;
    }
    this.records.set(pane.surfaceId, {
      adapter: this.adapterFactory(pane),
      pane,
      snapshotAdapter: new SnapshotSurfaceAdapter(pane, this.options.snapshotAdapter),
    });
  }

  syncPanes(panes: readonly WorkspacePane[]): void {
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
      this.recordMountedSnapshotFreshness(
        this.mountAdapterForHost({ adapter, existing, host, item, options, record }),
      );
    }

    const hostRecord = this.hostRecords.get(host);
    if (!hostRecord) {
      throw new Error(`missing workspace surface host record for ${item.surfaceId}`);
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
    this.warmSnapshotBitmap(record, host, item, options);
    return stats;
  }

  private mountAdapterForHost({
    adapter,
    existing,
    host,
    item,
    options,
    record,
  }: {
    adapter: SurfaceAdapter;
    existing: HostRecord | undefined;
    host: HTMLElement;
    item: PaneRenderItem;
    options: SurfaceSyncOptions;
    record: SurfaceRecord;
  }): SurfaceSnapshotFreshness | null {
    const mountedSnapshotFreshness = this.snapshotFreshnessForMount({
      adapter,
      existing,
      host,
      item,
      options,
      record,
    });
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
    return mountedSnapshotFreshness;
  }

  private snapshotFreshnessForMount({
    adapter,
    existing,
    host,
    item,
    options,
    record,
  }: {
    adapter: SurfaceAdapter;
    existing: HostRecord | undefined;
    host: HTMLElement;
    item: PaneRenderItem;
    options: SurfaceSyncOptions;
    record: SurfaceRecord;
  }): SurfaceSnapshotFreshness | null {
    if (adapter !== record.snapshotAdapter) {
      return null;
    }
    if (!existing) {
      return record.snapshotAdapter.textureFreshnessForHost(null);
    }
    if (snapshotTransitionStartup(item, options)) {
      return record.snapshotAdapter.textureFreshnessForHost(host);
    }
    this.recordSnapshotCaptureRequest("texture", item, options);
    return record.snapshotAdapter.captureTexture(host);
  }

  private recordMountedSnapshotFreshness(freshness: SurfaceSnapshotFreshness | null): void {
    if (freshness !== null) {
      this.options.metrics?.recordSnapshotTextureUse(freshness);
    }
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
        return record.adapter.kind === "browser" || usesFrozenLiveVisual(record.adapter.kind)
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
      throw new Error(`missing workspace surface adapter for ${surfaceId}`);
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

  private warmSnapshotBitmap(
    record: SurfaceRecord,
    host: HTMLElement,
    item: PaneRenderItem,
    options: SurfaceSyncOptions,
  ): void {
    if (
      item.runtimeState !== "live" ||
      item.moving ||
      options.resizePhase !== "idle" ||
      !bitmapSnapshotSurfaceKind(item.surfaceKind) ||
      workspacePaneDragSourceActive(host)
    ) {
      return;
    }
    if (item.presentationMode !== "normal") {
      return;
    }
    const started = record.snapshotAdapter.captureBitmap(host);
    if (started) {
      this.recordSnapshotCaptureRequest("bitmap", item, options);
    }
  }

  private recordSnapshotCaptureRequest(
    kind: "bitmap" | "texture",
    item: PaneRenderItem,
    options: SurfaceSyncOptions,
  ): void {
    this.options.metrics?.recordSnapshotCaptureRequest({
      duringTransition: snapshotTransitionStartup(item, options),
      kind,
    });
  }
}

type SurfaceViewportSyncReason = "frame" | "mount" | "movement-active" | "resize" | "resize-active";

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace surface registry value: ${String(value)}`);
}

function emptySurfaceViewportSyncStats(): SurfaceViewportSyncStats {
  return {
    browserViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    heavyViewportWrites: 0,
    surfaceViewportWrites: 0,
  };
}

function recordViewportWrite(kind: SurfaceKind, stats: SurfaceViewportSyncStats): void {
  stats.surfaceViewportWrites += 1;
  if (resizeDefersSurfaceViewport(kind)) {
    stats.heavyViewportWrites += 1;
  }
  if (kind === "browser") {
    stats.browserViewportWrites += 1;
  }
}

function resizeDefersSurfaceViewport(kind: SurfaceKind): boolean {
  return kind === "fake-heavy-dom";
}

function bitmapSnapshotSurfaceKind(kind: SurfaceKind): boolean {
  return kind === "easy-button" || kind === "fake-heavy-dom";
}

function workspacePaneDragSourceActive(host: HTMLElement): boolean {
  if (typeof host.closest !== "function") {
    return false;
  }
  const workspace = host.closest<HTMLElement>('[data-testid="workspace-layout-area"]');
  const activeDragSession =
    typeof workspace?.hasAttribute === "function" &&
    (workspace.hasAttribute("data-pane-dragging") ||
      workspace.hasAttribute("data-overview-dragging"));
  return Boolean(
    workspace &&
    (activeDragSession ||
      (typeof workspace.querySelector === "function" &&
        workspace.querySelector('[data-drag-source="true"]'))),
  );
}

function usesFrozenLiveVisual(kind: SurfaceKind): boolean {
  return kind !== "browser" && kind !== "snapshot";
}

function snapshotTransitionStartup(item: PaneRenderItem, options: SurfaceSyncOptions): boolean {
  return item.moving || item.presentationMode === "overview" || options.resizePhase === "active";
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

function sameRect(left: Rect, right: Rect): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
