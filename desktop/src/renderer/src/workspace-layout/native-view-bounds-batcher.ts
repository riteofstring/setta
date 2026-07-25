import type {
  AppearanceMasterVoiceShortcut,
  AppearanceWorkspaceNavigationShortcut,
} from "@generated/backend";
import type {
  WorkspaceBrowserViewBatch,
  WorkspaceBrowserViewStats,
  WorkspaceBrowserViewUpdate,
} from "@shared/types";

interface NativeViewBridge {
  batchBrowserViewUpdates(batch: WorkspaceBrowserViewBatch): void;
  teardownBrowserViews(workspaceId: string): Promise<WorkspaceBrowserViewStats>;
}

export interface NativeViewBoundsBatcherOptions {
  masterVoiceShortcut?: AppearanceMasterVoiceShortcut;
  workspaceNavigationShortcut?: AppearanceWorkspaceNavigationShortcut;
  workspaceRowsEnabled?: boolean;
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
  private lastLiveUpdates = new Map<string, WorkspaceBrowserViewUpdate>();
  private lastSentMasterVoiceShortcut: AppearanceMasterVoiceShortcut | null = null;
  private lastSentWorkspaceNavigationShortcut: AppearanceWorkspaceNavigationShortcut | null = null;
  private lastSentWorkspaceRowsEnabled: boolean | null = null;
  private lastSentUpdates = new Map<string, WorkspaceBrowserViewUpdate>();
  private masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  private workspaceNavigationShortcut: AppearanceWorkspaceNavigationShortcut;
  private workspaceRowsEnabled: boolean;
  private readonly updates = new Map<string, WorkspaceBrowserViewUpdate>();

  constructor(
    private readonly options: NativeViewBoundsBatcherOptions,
    private readonly bridge: NativeViewBridge | null = nativeViewBridge(),
  ) {
    this.masterVoiceShortcut = options.masterVoiceShortcut ?? "mod_shift_k";
    this.workspaceNavigationShortcut = options.workspaceNavigationShortcut ?? "mod_arrows";
    this.workspaceRowsEnabled = options.workspaceRowsEnabled ?? false;
  }

  setMasterVoiceShortcut(shortcut: AppearanceMasterVoiceShortcut): void {
    this.masterVoiceShortcut = shortcut;
  }

  setWorkspaceNavigationShortcut(shortcut: AppearanceWorkspaceNavigationShortcut): void {
    this.workspaceNavigationShortcut = shortcut;
  }

  setWorkspaceRowsEnabled(enabled: boolean): void {
    this.workspaceRowsEnabled = enabled;
  }

  beginFrame(): void {
    this.currentFrameSurfaceIds.clear();
    this.focusedSurfaceId = null;
    this.updates.clear();
  }

  flush(): NativeViewBoundsFlushResult {
    const { nextLiveUpdates, updates } = this.updatesForFlush();
    if (!this.bridge) {
      this.commitFlushState(nextLiveUpdates, updates);
      return { batchSent: false, updateCount: updates.length };
    }

    const shouldSend =
      updates.length > 0 ||
      this.masterVoiceShortcut !== this.lastSentMasterVoiceShortcut ||
      this.workspaceNavigationShortcut !== this.lastSentWorkspaceNavigationShortcut ||
      this.workspaceRowsEnabled !== this.lastSentWorkspaceRowsEnabled;

    if (!shouldSend) {
      this.commitFlushState(nextLiveUpdates, updates);
      return { batchSent: false, updateCount: 0 };
    }

    this.bridge.batchBrowserViewUpdates({
      focusedSurfaceId: this.focusedSurfaceId,
      masterVoiceShortcut: this.masterVoiceShortcut,
      workspaceNavigationShortcut: this.workspaceNavigationShortcut,
      workspaceRowsEnabled: this.workspaceRowsEnabled,
      totalBrowserPanes: this.options.totalBrowserPanes,
      updates,
      visibleBrowserPanes: this.currentFrameSurfaceIds.size,
      workspaceId: this.options.workspaceId,
    });
    this.commitFlushState(nextLiveUpdates, updates);
    this.lastSentMasterVoiceShortcut = this.masterVoiceShortcut;
    this.lastSentWorkspaceNavigationShortcut = this.workspaceNavigationShortcut;
    this.lastSentWorkspaceRowsEnabled = this.workspaceRowsEnabled;
    return { batchSent: true, updateCount: updates.length };
  }

  queue(update: WorkspaceBrowserViewUpdate): void {
    if (update.focused && update.visible && update.runtimeState === "live") {
      this.focusedSurfaceId = update.surfaceId;
    }
    if (update.visible && update.runtimeState === "live") {
      this.currentFrameSurfaceIds.add(update.surfaceId);
    }
    this.updates.set(update.surfaceId, update);
  }

  private updatesForFlush(): {
    nextLiveUpdates: Map<string, WorkspaceBrowserViewUpdate>;
    updates: WorkspaceBrowserViewUpdate[];
  } {
    const nextLiveUpdates = new Map<string, WorkspaceBrowserViewUpdate>();
    const queuedSurfaceIds = new Set<string>();
    const updates: WorkspaceBrowserViewUpdate[] = [];
    for (const update of this.updates.values()) {
      queuedSurfaceIds.add(update.surfaceId);
      if (update.visible && update.runtimeState === "live") {
        nextLiveUpdates.set(update.surfaceId, update);
      }
      this.pushChangedUpdate(updates, update);
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

  async teardown(): Promise<WorkspaceBrowserViewStats | null> {
    this.beginFrame();
    this.lastLiveUpdates.clear();
    this.lastSentUpdates.clear();
    if (!this.bridge) {
      return null;
    }
    return this.bridge.teardownBrowserViews(this.options.workspaceId);
  }

  private commitFlushState(
    nextLiveUpdates: Map<string, WorkspaceBrowserViewUpdate>,
    updates: WorkspaceBrowserViewUpdate[],
  ): void {
    this.lastLiveUpdates = nextLiveUpdates;
    for (const update of updates) {
      this.lastSentUpdates.set(update.surfaceId, update);
    }
  }

  private pushChangedUpdate(
    updates: WorkspaceBrowserViewUpdate[],
    update: WorkspaceBrowserViewUpdate,
  ): void {
    const previous = this.lastSentUpdates.get(update.surfaceId);
    if (!previous || !sameBrowserViewUpdate(previous, update)) {
      updates.push(update);
    }
  }
}

function hiddenUpdateFrom(update: WorkspaceBrowserViewUpdate): WorkspaceBrowserViewUpdate {
  return {
    ...update,
    focused: false,
    runtimeState: "hidden",
    visible: false,
  };
}

function sameBrowserViewUpdate(
  left: WorkspaceBrowserViewUpdate,
  right: WorkspaceBrowserViewUpdate,
): boolean {
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
  left: WorkspaceBrowserViewUpdate["bounds"],
  right: WorkspaceBrowserViewUpdate["bounds"],
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
  return window.setta?.workspaceNativeViews ?? null;
}
