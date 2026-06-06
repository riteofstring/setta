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

    const updates = [...this.updates.values()];
    const shouldSend =
      updates.length > 0 ||
      this.previousFrameSurfaceIds.size > 0 ||
      this.currentFrameSurfaceIds.size > 0;

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
    return { batchSent: true, updateCount: updates.length };
  }

  queue(update: NiriBrowserViewUpdate): void {
    this.currentFrameSurfaceIds.add(update.surfaceId);
    if (update.focused && update.visible && update.runtimeState === "live") {
      this.focusedSurfaceId = update.surfaceId;
    }
    this.updates.set(update.surfaceId, update);
  }

  async teardown(): Promise<NiriBrowserViewStats | null> {
    this.beginFrame();
    this.previousFrameSurfaceIds.clear();
    if (!this.bridge) {
      return null;
    }
    return this.bridge.teardownBrowserViews(this.options.workspaceId);
  }
}

function nativeViewBridge(): NativeViewBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.niriNativeViews ?? null;
}
