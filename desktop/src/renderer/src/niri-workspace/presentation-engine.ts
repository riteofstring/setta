import type { NiriMetricsCollector } from "./metrics";
import type { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import { SurfaceRegistry, type SurfaceViewportSyncStats } from "./surface-registry";
import type { NiriPane, PaneRenderItem, PaneRuntimeSummary, ResizePhase } from "./types";

export interface PresentationApplyOptions {
  resizePhase: ResizePhase;
}

export interface PresentationWriteCounts extends SurfaceViewportSyncStats {
  boxWrites: number;
  nativeBoundsUpdates: number;
  transformWrites: number;
}

interface PaneHostBinding {
  contentPaneId: string | null;
  host: HTMLElement;
  lastFocused: boolean | null;
  lastHeight: number;
  lastMoving: boolean | null;
  lastOpacity: number;
  lastPresentationMode: string | null;
  lastRuntimeState: string | null;
  lastTransform: string;
  lastVisible: boolean | null;
  lastWidth: number;
  lastZ: number;
}

export class PresentationEngine {
  private bindings: PaneHostBinding[] = [];
  private debugOverlay: HTMLElement | null = null;
  private paneById = new Map<string, NiriPane>();

  constructor(
    panes: readonly NiriPane[],
    private readonly metrics: NiriMetricsCollector,
    private readonly surfaceRegistry = new SurfaceRegistry(panes),
    private readonly nativeViewBoundsBatcher: NativeViewBoundsBatcher | null = null,
  ) {
    for (const pane of panes) {
      this.paneById.set(pane.paneId, pane);
    }
  }

  apply(items: PaneRenderItem[], options: PresentationApplyOptions): PresentationWriteCounts {
    const writeCounts = emptyPresentationWriteCounts();
    const assignedItems = this.assignItemsToBindings(items);
    this.nativeViewBoundsBatcher?.beginFrame();

    for (let index = 0; index < this.bindings.length; index += 1) {
      const binding = this.bindings[index];
      if (!binding) {
        continue;
      }
      const item = assignedItems[index];
      addPresentationWriteCounts(writeCounts, this.applyBinding(binding, item, options));
    }

    const nativeFlush = this.nativeViewBoundsBatcher?.flush();
    this.metrics.recordCanvasStats(this.surfaceRegistry.canvasStats());
    this.metrics.recordGitGraphStats(this.surfaceRegistry.gitGraphStats());
    this.metrics.recordTerminalStats(this.surfaceRegistry.terminalStats());
    writeCounts.nativeBoundsUpdates = nativeFlush?.batchSent ? 1 : 0;
    return writeCounts;
  }

  mount(hosts: readonly HTMLElement[], debugOverlay: HTMLElement | null): void {
    this.bindings = hosts.map((host) => ({
      contentPaneId: host.dataset.paneId ?? null,
      host,
      lastFocused: null,
      lastHeight: -1,
      lastMoving: null,
      lastOpacity: -1,
      lastPresentationMode: null,
      lastRuntimeState: null,
      lastTransform: "",
      lastVisible: null,
      lastWidth: -1,
      lastZ: -1,
    }));
    this.debugOverlay = debugOverlay;
  }

  private assignItemsToBindings(
    items: readonly PaneRenderItem[],
  ): Array<PaneRenderItem | undefined> {
    const assignments: Array<PaneRenderItem | undefined> = Array.from({
      length: this.bindings.length,
    });
    const renderableItems = this.renderableItems(items);
    const itemByPaneId = new Map(renderableItems.map((item) => [item.paneId, item]));
    const assignedPaneIds = new Set<string>();
    const assignedBindingIndexes = new Set<number>();

    for (let index = 0; index < this.bindings.length; index += 1) {
      const paneId = this.bindings[index]?.contentPaneId;
      const item = paneId ? itemByPaneId.get(paneId) : undefined;
      if (!item) {
        continue;
      }
      assignments[index] = item;
      assignedPaneIds.add(item.paneId);
      assignedBindingIndexes.add(index);
    }

    for (const item of renderableItems) {
      if (assignedPaneIds.has(item.paneId)) {
        continue;
      }
      const bindingIndex = this.nextAvailableBindingIndex(assignedBindingIndexes);
      if (bindingIndex === null) {
        continue;
      }
      assignments[bindingIndex] = item;
      assignedPaneIds.add(item.paneId);
      assignedBindingIndexes.add(bindingIndex);
    }

    return assignments;
  }

  private renderableItems(items: readonly PaneRenderItem[]): readonly PaneRenderItem[] {
    if (items.length <= this.bindings.length) {
      return items;
    }
    return [
      ...items.filter((item) => item.focused),
      ...items.filter((item) => !item.focused),
    ].slice(0, this.bindings.length);
  }

  private nextAvailableBindingIndex(assignedBindingIndexes: ReadonlySet<number>): number | null {
    for (let index = 0; index < this.bindings.length; index += 1) {
      const binding = this.bindings[index];
      if (!binding || assignedBindingIndexes.has(index)) {
        continue;
      }
      if (binding.contentPaneId === null) {
        return index;
      }
    }
    for (let index = 0; index < this.bindings.length; index += 1) {
      if (!assignedBindingIndexes.has(index)) {
        return index;
      }
    }
    return null;
  }

  syncPanes(panes: readonly NiriPane[]): void {
    for (const pane of panes) {
      this.paneById.set(pane.paneId, pane);
      this.surfaceRegistry.ensurePane(pane);
    }
  }

  private applyBinding(
    binding: PaneHostBinding,
    item: PaneRenderItem | undefined,
    options: PresentationApplyOptions,
  ): PresentationWriteCounts {
    if (!item) {
      this.hideBinding(binding);
      return emptyPresentationWriteCounts();
    }
    if (this.shouldSyncContent(binding, item)) {
      return addPresentationWriteCounts(
        this.syncContent(binding, item, options),
        this.syncFrame(binding, item),
      );
    }
    return this.syncFrame(binding, item);
  }

  teardown(): void {
    for (const binding of this.bindings) {
      binding.host.removeAttribute("data-focused");
      binding.host.removeAttribute("data-moving");
      binding.host.removeAttribute("data-pane-id");
      binding.host.removeAttribute("data-presentation-mode");
      binding.host.removeAttribute("data-visible");
      binding.host.style.cssText = "";
    }
    if (this.debugOverlay) {
      this.debugOverlay.textContent = "";
    }
    this.surfaceRegistry.teardown();
    void this.nativeViewBoundsBatcher?.teardown().catch((error: unknown) => {
      console.error(
        "failed to teardown niri native browser views",
        error instanceof Error ? error.message : error,
      );
    });
    this.bindings = [];
    this.debugOverlay = null;
  }

  updateDebugOverlay(runtimeSummary: PaneRuntimeSummary): void {
    if (!this.debugOverlay) {
      return;
    }
    const snapshot = this.metrics.snapshot();
    this.debugOverlay.textContent = [
      `frame ${snapshot.frameTime.toFixed(2)}ms`,
      `p95 ${snapshot.p95FrameTime.toFixed(2)}ms`,
      `p99 ${snapshot.p99FrameTime.toFixed(2)}ms`,
      `visible ${snapshot.visiblePaneCount}`,
      `writes ${snapshot.transformWrites}/${snapshot.boxWrites}`,
      `native ${snapshot.nativeBoundsUpdates}`,
      `long ${snapshot.longTasks}`,
      `react ${snapshot.reactCommitsDuringMovement}`,
      `resize ${snapshot.resize.frameCount}/${snapshot.resize.p95FrameTime.toFixed(
        2,
      )}/${snapshot.resize.deferredHeavyViewportWrites}/${snapshot.resize.heavyViewportWrites}/${snapshot.reactCommitsDuringResize}`,
      `canvas ${snapshot.liveCanvasPaneCount}/${snapshot.canvasDrawCalls}/${formatBytes(
        snapshot.canvasGpuMemoryEstimateBytes,
      )}`,
      `terminal ${snapshot.liveTerminalRendererCount}/${snapshot.terminalDirtyRows}/${snapshot.terminalPendingOutputChunks}`,
      `graph ${snapshot.liveGitGraphPaneCount}/${snapshot.gitGraphRenderer ?? "none"}/${Math.round(
        snapshot.gitGraphProgress * 100,
      )}%/${snapshot.gitGraphWorkerBatches}${snapshot.gitGraphWorkerPending ? "+" : ""}`,
      `runtime ${runtimeSummary.live}/${runtimeSummary.snapshot}/${runtimeSummary.liveThrottled}/${runtimeSummary.hidden}`,
      `budget heavy ${runtimeSummary.budget.maxLiveHeavyDomPanes} canvas ${runtimeSummary.budget.maxLiveWebGpuCanvases} terminal ${runtimeSummary.budget.maxLiveTerminalRenderers}`,
    ].join(" | ");
  }

  private hideBinding(binding: PaneHostBinding): void {
    this.surfaceRegistry.releaseHost(binding.host);
    binding.contentPaneId = null;
    binding.host.dataset.paneId = "";
    binding.host.style.opacity = "0";
    binding.host.style.pointerEvents = "none";
    binding.lastOpacity = 0;
    binding.host.dataset.visible = "false";
    binding.lastVisible = false;
  }

  private syncContent(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    options: PresentationApplyOptions,
  ): PresentationWriteCounts {
    if (
      binding.contentPaneId !== item.paneId &&
      !this.hostContentMissing(binding) &&
      !this.contentSyncAllowedDuringMovement(item)
    ) {
      return emptyPresentationWriteCounts();
    }
    const pane = this.paneById.get(item.paneId);
    if (!pane) {
      throw new Error(`missing fake pane metadata for ${item.paneId}`);
    }
    binding.contentPaneId = item.paneId;
    binding.host.dataset.paneId = item.paneId;
    binding.host.dataset.tone = pane.tone;
    return {
      ...emptyPresentationWriteCounts(),
      ...this.surfaceRegistry.syncHost(binding.host, item, options),
    };
  }

  private shouldSyncContent(binding: PaneHostBinding, item: PaneRenderItem): boolean {
    return (
      this.hostContentMissing(binding) ||
      binding.contentPaneId === item.paneId ||
      this.contentSyncAllowedDuringMovement(item)
    );
  }

  private contentSyncAllowedDuringMovement(item: PaneRenderItem): boolean {
    return !item.moving || item.focused || item.surfaceKind === "browser";
  }

  private hostContentMissing(binding: PaneHostBinding): boolean {
    return binding.host.childElementCount === 0;
  }

  private syncFrame(binding: PaneHostBinding, item: PaneRenderItem): PresentationWriteCounts {
    const writeCounts = emptyPresentationWriteCounts();
    writeCounts.transformWrites = this.syncTransform(binding, item);
    writeCounts.boxWrites = this.syncBox(binding, item);
    this.syncLayer(binding, item);
    this.syncState(binding, item);
    return writeCounts;
  }

  private syncBox(binding: PaneHostBinding, item: PaneRenderItem): number {
    let boxWrites = 0;
    if (binding.lastWidth !== item.width) {
      binding.host.style.width = `${item.width.toFixed(2)}px`;
      binding.lastWidth = item.width;
      boxWrites += 1;
    }
    if (binding.lastHeight !== item.height) {
      binding.host.style.height = `${item.height.toFixed(2)}px`;
      binding.lastHeight = item.height;
      boxWrites += 1;
    }
    return boxWrites;
  }

  private syncLayer(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastOpacity !== item.opacity) {
      binding.host.style.opacity = item.opacity.toFixed(3);
      binding.lastOpacity = item.opacity;
    }
    if (binding.lastZ !== item.z) {
      binding.host.style.zIndex = String(item.z);
      binding.lastZ = item.z;
    }
  }

  private syncState(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastFocused !== item.focused) {
      binding.host.dataset.focused = String(item.focused);
      binding.lastFocused = item.focused;
    }
    if (binding.lastMoving !== item.moving) {
      binding.host.dataset.moving = String(item.moving);
      binding.lastMoving = item.moving;
    }
    const presentationModeChanged = binding.lastPresentationMode !== item.presentationMode;
    if (presentationModeChanged) {
      binding.host.dataset.presentationMode = item.presentationMode;
      binding.lastPresentationMode = item.presentationMode;
    }
    if (binding.lastVisible !== item.visible || presentationModeChanged) {
      binding.host.dataset.visible = String(item.visible);
      binding.host.style.pointerEvents =
        item.visible && item.presentationMode !== "overview" ? "auto" : "none";
      binding.lastVisible = item.visible;
    }
    if (binding.lastRuntimeState !== item.runtimeState) {
      binding.host.dataset.runtimeState = item.runtimeState;
      binding.lastRuntimeState = item.runtimeState;
    }
  }

  private syncTransform(binding: PaneHostBinding, item: PaneRenderItem): number {
    const transform = `translate3d(${item.x.toFixed(2)}px, ${item.y.toFixed(
      2,
    )}px, 0) scale(${item.scale.toFixed(3)})`;
    if (binding.lastTransform !== transform) {
      binding.host.style.transform = transform;
      binding.lastTransform = transform;
      return 1;
    }
    return 0;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "n/a";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}

function emptyPresentationWriteCounts(): PresentationWriteCounts {
  return {
    boxWrites: 0,
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    nativeBoundsUpdates: 0,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
    transformWrites: 0,
  };
}

function addPresentationWriteCounts(
  target: PresentationWriteCounts,
  source: PresentationWriteCounts,
): PresentationWriteCounts {
  target.boxWrites += source.boxWrites;
  target.browserViewportWrites += source.browserViewportWrites;
  target.canvasViewportWrites += source.canvasViewportWrites;
  target.deferredHeavyViewportWrites += source.deferredHeavyViewportWrites;
  target.gitGraphViewportWrites += source.gitGraphViewportWrites;
  target.heavyViewportWrites += source.heavyViewportWrites;
  target.nativeBoundsUpdates += source.nativeBoundsUpdates;
  target.surfaceViewportWrites += source.surfaceViewportWrites;
  target.terminalViewportWrites += source.terminalViewportWrites;
  target.transformWrites += source.transformWrites;
  return target;
}
