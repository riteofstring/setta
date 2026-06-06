import type {
  NiriBrowserViewBatch,
  NiriBrowserViewStats,
  NiriBrowserViewUpdate,
} from "@shared/types";

interface NativeViewBridge {
  batchBrowserViewUpdates(batch: NiriBrowserViewBatch): void;
  teardownBrowserViews(workspaceId: string): Promise<NiriBrowserViewStats>;
}

export interface NativeViewBoundsBatcherOptions {
  totalBrowserPanes: number;
  workspaceId: string;
}

export interface NativeViewBoundsFlushResult {
  batchSent: boolean;
  updateCount: number;
}

export class NativeViewBoundsBatcher {
  private currentFrameSurfaceIds = new Set<string>();
  private focusedSurfaceId: string | null = null;
  private lastLiveUpdates = new Map<string, NiriBrowserViewUpdate>();
  private previousFrameSurfaceIds = new Set<string>();
  private readonly updates = new Map<string, NiriBrowserViewUpdate>();

  constructor(
    private readonly options: NativeViewBoundsBatcherOptions,
    private readonly bridge: NativeViewBridge | null = nativeViewBridge(),
  ) {}

  beginFrame(): void {
    this.currentFrameSurfaceIds.clear();
    this.focusedSurfaceId = null;
    this.updates.clear();
  }

  flush(): NativeViewBoundsFlushResult {
    if (!this.bridge) {
      this.previousFrameSurfaceIds = new Set(this.currentFrameSurfaceIds);
      return { batchSent: false, updateCount: this.updates.size };
    }

    const updates = this.updatesForFlush();
    const shouldSend = updates.length > 0;

    if (!shouldSend) {
      return { batchSent: false, updateCount: 0 };
    }

    this.bridge.batchBrowserViewUpdates({
      focusedSurfaceId: this.focusedSurfaceId,
      totalBrowserPanes: this.options.totalBrowserPanes,
      updates,
      visibleBrowserPanes: this.currentFrameSurfaceIds.size,
      workspaceId: this.options.workspaceId,
    });
    this.previousFrameSurfaceIds = new Set(this.currentFrameSurfaceIds);
    this.lastLiveUpdates = liveUpdatesFor(updates);
    return { batchSent: true, updateCount: updates.length };
  }

  queue(update: NiriBrowserViewUpdate): void {
    if (update.focused && update.visible && update.runtimeState === "live") {
      this.focusedSurfaceId = update.surfaceId;
    }
    if (update.visible && update.runtimeState === "live") {
      this.currentFrameSurfaceIds.add(update.surfaceId);
    }
    this.updates.set(update.surfaceId, update);
  }

  private updatesForFlush(): NiriBrowserViewUpdate[] {
    if (this.updates.size === 0) {
      return [];
    }

    const liveUpdates = new Map(this.lastLiveUpdates);
    const nonLiveUpdates: NiriBrowserViewUpdate[] = [];
    for (const update of this.updates.values()) {
      if (update.visible && update.runtimeState === "live") {
        liveUpdates.set(update.surfaceId, update);
      } else {
        liveUpdates.delete(update.surfaceId);
        nonLiveUpdates.push(update);
      }
    }
    this.currentFrameSurfaceIds = new Set(
      [...liveUpdates.values()].map((update) => update.surfaceId),
    );
    return [...liveUpdates.values(), ...nonLiveUpdates];
  }

  async teardown(): Promise<NiriBrowserViewStats | null> {
    this.beginFrame();
    this.lastLiveUpdates.clear();
    this.previousFrameSurfaceIds.clear();
    if (!this.bridge) {
      return null;
    }
    return this.bridge.teardownBrowserViews(this.options.workspaceId);
  }
}

function liveUpdatesFor(updates: NiriBrowserViewUpdate[]): Map<string, NiriBrowserViewUpdate> {
  const liveUpdates = new Map<string, NiriBrowserViewUpdate>();
  for (const update of updates) {
    if (update.visible && update.runtimeState === "live") {
      liveUpdates.set(update.surfaceId, update);
    }
  }
  return liveUpdates;
}

function nativeViewBridge(): NativeViewBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.niriNativeViews ?? null;
}
