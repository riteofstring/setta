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
    const { nextLiveUpdates, updates } = this.updatesForFlush();
    if (!this.bridge) {
      this.lastLiveUpdates = nextLiveUpdates;
      return { batchSent: false, updateCount: updates.length };
    }

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
    this.lastLiveUpdates = nextLiveUpdates;
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

  private updatesForFlush(): {
    nextLiveUpdates: Map<string, NiriBrowserViewUpdate>;
    updates: NiriBrowserViewUpdate[];
  } {
    const nextLiveUpdates = new Map<string, NiriBrowserViewUpdate>();
    const queuedSurfaceIds = new Set<string>();
    const updates: NiriBrowserViewUpdate[] = [];
    for (const update of this.updates.values()) {
      queuedSurfaceIds.add(update.surfaceId);
      if (update.visible && update.runtimeState === "live") {
        nextLiveUpdates.set(update.surfaceId, update);
        const previous = this.lastLiveUpdates.get(update.surfaceId);
        if (!previous || !sameBrowserViewUpdate(previous, update)) {
          updates.push(update);
        }
      } else {
        updates.push(update);
      }
    }
    for (const [surfaceId, update] of this.lastLiveUpdates) {
      if (nextLiveUpdates.has(surfaceId) || queuedSurfaceIds.has(surfaceId)) {
        continue;
      }
      updates.push(hiddenUpdateFrom(update));
    }
    this.currentFrameSurfaceIds = new Set(
      [...nextLiveUpdates.values()].map((update) => update.surfaceId),
    );
    return { nextLiveUpdates, updates };
  }

  async teardown(): Promise<NiriBrowserViewStats | null> {
    this.beginFrame();
    this.lastLiveUpdates.clear();
    if (!this.bridge) {
      return null;
    }
    return this.bridge.teardownBrowserViews(this.options.workspaceId);
  }
}

function hiddenUpdateFrom(update: NiriBrowserViewUpdate): NiriBrowserViewUpdate {
  return {
    ...update,
    focused: false,
    runtimeState: "hidden",
    visible: false,
  };
}

function sameBrowserViewUpdate(left: NiriBrowserViewUpdate, right: NiriBrowserViewUpdate): boolean {
  const scalarFields = [
    "focused",
    "paneId",
    "runtimeState",
    "surfaceId",
    "title",
    "url",
    "visible",
  ] as const;
  return (
    sameRectangle(left.bounds, right.bounds) &&
    sameRectangle(left.contentBounds, right.contentBounds) &&
    scalarFields.every((field) => left[field] === right[field])
  );
}

function sameRectangle(
  left: NiriBrowserViewUpdate["bounds"],
  right: NiriBrowserViewUpdate["bounds"],
): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}

function nativeViewBridge(): NativeViewBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.niriNativeViews ?? null;
}
