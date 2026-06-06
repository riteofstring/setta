import { createFakeSurfaceAdapter, SnapshotSurfaceAdapter } from "./surface-adapters";
import type {
  FreezeReason,
  NiriPane,
  PaneRenderItem,
  Rect,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
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
  private readonly records = new Map<SurfaceId, SurfaceRecord>();

  constructor(
    panes: readonly NiriPane[],
    private readonly adapterFactory: SurfaceAdapterFactory = createFakeSurfaceAdapter,
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
      record.adapter.destroy();
      record.snapshotAdapter.destroy();
    }
    this.hostRecords.clear();
    this.records.clear();
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
