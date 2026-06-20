import type { WorkspaceMetricsCollector } from "./metrics";
import type { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import { SurfaceRegistry, type SurfaceViewportSyncStats } from "./surface-registry";
import type { WorkspacePane, PaneRenderItem, PaneRuntimeSummary, ResizePhase } from "./types";

export interface PresentationApplyOptions {
  resizePhase: ResizePhase;
}

export interface PresentationWriteCounts extends SurfaceViewportSyncStats {
  boxWrites: number;
  nativeBoundsUpdates: number;
  transformWrites: number;
}

export interface PresentationEngineOptions {
  syncAllRenderedContentDuringMovement?: boolean;
}

interface PaneHostBinding {
  contentPaneId: string | null;
  host: HTMLElement;
  lastFocused: boolean | null;
  lastHeight: number;
  lastMaximized: boolean | null;
  lastMoving: boolean | null;
  lastOpacity: number;
  lastPresentationMode: string | null;
  lastRuntimeState: string | null;
  lastTransform: string;
  lastVisible: boolean | null;
  lastWidth: number;
  lastZ: number;
}

type PaneResizeAxis = "horizontal" | "vertical";
type PaneChromeAction = "add-above" | "add-below" | "close" | "maximize" | "split-down";

interface PaneVisualRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface ResizeNeighborMeasurement {
  gap: number;
  item: PaneRenderItem;
}

const maximumResizeNeighborGapPx = 48;
const paneChromeActions = [
  "split-down",
  "add-above",
  "add-below",
  "maximize",
  "close",
] satisfies PaneChromeAction[];

export class PresentationEngine {
  private bindings: PaneHostBinding[] = [];
  private debugOverlay: HTMLElement | null = null;
  private paneById = new Map<string, WorkspacePane>();
  private resizeHandles = new WeakMap<HTMLElement, Partial<Record<PaneResizeAxis, HTMLElement>>>();

  constructor(
    panes: readonly WorkspacePane[],
    private readonly metrics: WorkspaceMetricsCollector,
    private readonly surfaceRegistry = new SurfaceRegistry(panes),
    private readonly nativeViewBoundsBatcher: NativeViewBoundsBatcher | null = null,
    private readonly options: PresentationEngineOptions = {},
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
      addPresentationWriteCounts(
        writeCounts,
        this.applyBinding(binding, item, assignedItems, options),
      );
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
      lastMaximized: null,
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

  setDebugOverlay(debugOverlay: HTMLElement | null): void {
    if (this.debugOverlay && this.debugOverlay !== debugOverlay) {
      this.debugOverlay.textContent = "";
    }
    this.debugOverlay = debugOverlay;
  }

  syncPanes(panes: readonly WorkspacePane[]): void {
    const nextPaneIds = new Set(panes.map((pane) => pane.paneId));
    for (const paneId of [...this.paneById.keys()]) {
      if (!nextPaneIds.has(paneId)) {
        this.paneById.delete(paneId);
      }
    }
    for (const pane of panes) {
      this.paneById.set(pane.paneId, pane);
    }
    this.surfaceRegistry.syncPanes(panes);
  }

  teardown(): void {
    for (const binding of this.bindings) {
      binding.host.removeAttribute("data-focused");
      binding.host.removeAttribute("data-maximized");
      binding.host.removeAttribute("data-moving");
      binding.host.removeAttribute("data-pane-id");
      binding.host.removeAttribute("data-presentation-mode");
      binding.host.removeAttribute("data-visible");
      this.paneTopBarForHost(binding.host)?.remove();
      this.removeResizeHandles(binding.host);
      binding.host.style.cssText = "";
    }
    if (this.debugOverlay) {
      this.debugOverlay.textContent = "";
    }
    this.surfaceRegistry.teardown();
    void this.nativeViewBoundsBatcher?.teardown().catch((error: unknown) => {
      console.error(
        "failed to teardown workspace native browser views",
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
      `canvas ${snapshot.liveCanvasPaneCount}/${snapshot.canvasDrawCalls}/${snapshot.canvasRendererResizeCount}/${snapshot.canvasTickerFramesWhileFrozen}/${formatPixels(snapshot.canvasBackingStorePixels)}/${formatBytes(
        snapshot.canvasGpuMemoryEstimateBytes,
      )}`,
      `terminal ${snapshot.liveTerminalRendererCount}/${snapshot.terminalDirtyRows}/${snapshot.terminalPendingOutputChunks}`,
      `snapshot ${snapshot.snapshotFreshTextureUses}/${snapshot.snapshotStaleTextureUses}/${snapshot.snapshotMissingTextureUses}/${snapshot.snapshotCaptureRequestsDuringTransition}`,
      `graph ${snapshot.liveGitGraphPaneCount}/${snapshot.gitGraphRenderer ?? "none"}/${Math.round(
        snapshot.gitGraphProgress * 100,
      )}%/${snapshot.gitGraphWorkerBatches}${snapshot.gitGraphWorkerPending ? "+" : ""}`,
      `runtime ${runtimeSummary.live}/${runtimeSummary.snapshot}/${runtimeSummary.liveThrottled}/${runtimeSummary.hidden}`,
      `budget heavy ${runtimeSummary.budget.maxLiveHeavyDomPanes} canvas ${runtimeSummary.budget.maxLiveWebGpuCanvases} terminal ${runtimeSummary.budget.maxLiveTerminalRenderers}`,
    ].join(" | ");
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

  private applyBinding(
    binding: PaneHostBinding,
    item: PaneRenderItem | undefined,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
    options: PresentationApplyOptions,
  ): PresentationWriteCounts {
    if (!item) {
      this.hideBinding(binding);
      return emptyPresentationWriteCounts();
    }
    const writeCounts = this.shouldSyncContent(binding, item)
      ? addPresentationWriteCounts(
          this.syncContent(binding, item, assignedItems, options),
          this.syncFrame(binding, item),
        )
      : this.syncFrame(binding, item);
    this.syncPaneControls(binding, item, assignedItems);
    return writeCounts;
  }

  private hideBinding(binding: PaneHostBinding): void {
    this.surfaceRegistry.releaseHost(binding.host);
    this.removeResizeHandles(binding.host);
    binding.contentPaneId = null;
    binding.host.dataset.focused = "false";
    binding.host.dataset.maximized = "false";
    binding.host.dataset.moving = "false";
    binding.host.dataset.paneId = "";
    binding.host.style.opacity = "0";
    binding.host.style.pointerEvents = "none";
    binding.lastFocused = false;
    binding.lastMaximized = false;
    binding.lastMoving = false;
    binding.lastOpacity = 0;
    binding.host.dataset.visible = "false";
    binding.lastVisible = false;
  }

  private syncPaneControls(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
  ): void {
    if (!this.paneById.has(item.paneId)) {
      throw new Error(`missing pane controls metadata for ${item.paneId}`);
    }
    const topBar = this.ensurePaneTopBar(binding.host);
    topBar.dataset.paneId = item.paneId;

    const dragHandle = this.ensureDragHandle(topBar);
    dragHandle.dataset.paneId = item.paneId;

    const actionStrip = this.ensurePaneActionStrip(topBar);
    actionStrip.dataset.paneId = item.paneId;
    let visibleActionCount = 0;
    for (const action of paneChromeActions) {
      const button = this.ensurePaneActionButton(actionStrip, action);
      const visible = paneChromeActionVisible(action, item);
      if (visible) {
        visibleActionCount += 1;
      }
      this.syncPaneActionButton(button, action, item, visible);
    }
    actionStrip.dataset.workspacePaneControlsVisible = visibleActionCount > 0 ? "true" : "false";

    this.syncResizeHandle(
      binding.host,
      item,
      "horizontal",
      resizeNeighborItem(item, assignedItems, "horizontal"),
    );
    this.syncResizeHandle(
      binding.host,
      item,
      "vertical",
      resizeNeighborItem(item, assignedItems, "vertical"),
    );
  }

  private ensurePaneTopBar(host: HTMLElement): HTMLElement {
    const existing = this.paneTopBarForHost(host);
    if (existing) {
      return existing;
    }
    const topBar = host.ownerDocument.createElement("div");
    topBar.className = "workspace-pane-top-bar app-drag";
    topBar.dataset.workspacePaneTopBar = "true";
    host.append(topBar);
    return topBar;
  }

  private ensureDragHandle(topBar: HTMLElement): HTMLButtonElement {
    const existing = this.dragHandleForTopBar(topBar);
    if (existing) {
      return existing;
    }
    const button = topBar.ownerDocument.createElement("button");
    button.className = "workspace-pane-drag-handle app-no-drag";
    button.dataset.workspacePaneDragHandle = "true";
    button.type = "button";
    button.setAttribute("aria-label", "Drag pane");
    button.title = "Drag pane";
    topBar.prepend(button);
    return button;
  }

  private ensurePaneActionStrip(topBar: HTMLElement): HTMLElement {
    const existing = this.paneActionStripForTopBar(topBar);
    if (existing) {
      return existing;
    }
    const actionStrip = topBar.ownerDocument.createElement("div");
    actionStrip.className = "workspace-pane-action-strip app-no-drag";
    actionStrip.dataset.workspacePaneActionStrip = "true";
    topBar.append(actionStrip);
    return actionStrip;
  }

  private ensurePaneActionButton(
    actionStrip: HTMLElement,
    action: PaneChromeAction,
  ): HTMLButtonElement {
    const existing = this.paneActionButtonForStrip(actionStrip, action);
    if (existing) {
      return existing;
    }
    const button = actionStrip.ownerDocument.createElement("button");
    button.className = paneActionButtonClassName(action);
    button.dataset.workspacePaneAction = action;
    if (action === "maximize") {
      button.dataset.workspacePaneMaximizeButton = "true";
    }
    button.type = "button";
    actionStrip.append(button);
    return button;
  }

  private syncPaneActionButton(
    button: HTMLButtonElement,
    action: PaneChromeAction,
    item: PaneRenderItem,
    visible: boolean,
  ): void {
    button.dataset.paneId = item.paneId;
    const label = paneActionButtonLabel(action, item);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = !visible;
    button.tabIndex = visible ? 0 : -1;
    button.style.display = visible ? "" : "none";
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  private syncResizeHandle(
    host: HTMLElement,
    item: PaneRenderItem,
    axis: PaneResizeAxis,
    adjacentItem: PaneRenderItem | null,
  ): void {
    const existing = this.resizeHandleForHost(host, axis);
    if (!adjacentItem || item.presentationMode !== "normal" || item.maximized) {
      if (existing) {
        this.removeResizeHandle(host, axis);
      }
      return;
    }
    const handle = existing ?? this.createResizeHandle(host, axis);
    const label = axis === "horizontal" ? "Resize adjacent columns" : "Resize stacked panes";
    handle.dataset.paneId = item.paneId;
    handle.dataset.adjacentPaneId = adjacentItem.paneId;
    handle.setAttribute("aria-label", label);
    handle.title = label;
    positionResizeHandle(handle, axis, visualRectForItem(item), visualRectForItem(adjacentItem));
  }

  private createResizeHandle(host: HTMLElement, axis: PaneResizeAxis): HTMLElement {
    const handle = host.ownerDocument.createElement("div");
    handle.className = `workspace-pane-resize-handle workspace-pane-resize-handle-${axis} app-no-drag`;
    handle.dataset.workspacePaneResizeAxis = axis;
    handle.setAttribute("aria-orientation", axis === "horizontal" ? "vertical" : "horizontal");
    handle.setAttribute("role", "separator");
    handle.tabIndex = -1;
    (host.parentElement ?? host).append(handle);
    const handles = this.resizeHandles.get(host) ?? {};
    handles[axis] = handle;
    this.resizeHandles.set(host, handles);
    return handle;
  }

  private paneTopBarForHost(host: HTMLElement): HTMLElement | null {
    const existing = Array.from(host.children).find((child) =>
      child.classList.contains("workspace-pane-top-bar"),
    );
    return existing ? (existing as HTMLElement) : null;
  }

  private dragHandleForTopBar(topBar: HTMLElement): HTMLButtonElement | null {
    const existing = Array.from(topBar.children).find((child) =>
      child.classList.contains("workspace-pane-drag-handle"),
    );
    return existing ? (existing as HTMLButtonElement) : null;
  }

  private resizeHandleForHost(host: HTMLElement, axis: PaneResizeAxis): HTMLElement | null {
    return this.resizeHandles.get(host)?.[axis] ?? null;
  }

  private resizeHandlesForHost(host: HTMLElement): HTMLElement[] {
    return Object.values(this.resizeHandles.get(host) ?? {});
  }

  private removeResizeHandles(host: HTMLElement): void {
    for (const handle of this.resizeHandlesForHost(host)) {
      handle.remove();
    }
    this.resizeHandles.delete(host);
  }

  private removeResizeHandle(host: HTMLElement, axis: PaneResizeAxis): void {
    const handles = this.resizeHandles.get(host);
    const handle = handles?.[axis];
    if (!handles || !handle) {
      return;
    }
    handle.remove();
    delete handles[axis];
    if (Object.values(handles).length === 0) {
      this.resizeHandles.delete(host);
    }
  }

  private paneActionStripForTopBar(topBar: HTMLElement): HTMLElement | null {
    const existing = Array.from(topBar.children).find((child) =>
      child.classList.contains("workspace-pane-action-strip"),
    );
    return existing ? (existing as HTMLElement) : null;
  }

  private paneActionButtonForStrip(
    actionStrip: HTMLElement,
    action: PaneChromeAction,
  ): HTMLButtonElement | null {
    const existing = Array.from(actionStrip.children).find(
      (child) => (child as HTMLElement).dataset.workspacePaneAction === action,
    );
    return existing ? (existing as HTMLButtonElement) : null;
  }

  private syncContent(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
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
      ...this.surfaceRegistry.syncHost(binding.host, surfaceSyncItem(item, assignedItems), options),
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
    return (
      this.options.syncAllRenderedContentDuringMovement ||
      !item.moving ||
      item.focused ||
      item.surfaceKind === "browser"
    );
  }

  private hostContentMissing(binding: PaneHostBinding): boolean {
    const chromeChildCount = this.paneTopBarForHost(binding.host) ? 1 : 0;
    return binding.host.childElementCount <= chromeChildCount || !binding.host.dataset.surfaceId;
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
    this.syncBooleanState(binding, "focused", "lastFocused", item.focused);
    this.syncBooleanState(binding, "moving", "lastMoving", item.moving);
    this.syncBooleanState(binding, "maximized", "lastMaximized", item.maximized);
    const presentationModeChanged = this.syncPresentationMode(binding, item);
    this.syncVisibleState(binding, item, presentationModeChanged);
    this.syncRuntimeState(binding, item);
  }

  private syncBooleanState(
    binding: PaneHostBinding,
    datasetKey: "focused" | "maximized" | "moving",
    cacheKey: "lastFocused" | "lastMaximized" | "lastMoving",
    value: boolean,
  ): void {
    if (binding[cacheKey] === value) {
      return;
    }
    binding.host.dataset[datasetKey] = String(value);
    binding[cacheKey] = value;
  }

  private syncPresentationMode(binding: PaneHostBinding, item: PaneRenderItem): boolean {
    if (binding.lastPresentationMode === item.presentationMode) {
      return false;
    }
    binding.host.dataset.presentationMode = item.presentationMode;
    binding.lastPresentationMode = item.presentationMode;
    return true;
  }

  private syncVisibleState(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    presentationModeChanged: boolean,
  ): void {
    if (binding.lastVisible === item.visible && !presentationModeChanged) {
      return;
    }
    binding.host.dataset.visible = String(item.visible);
    binding.host.style.pointerEvents = item.visible ? "auto" : "none";
    binding.lastVisible = item.visible;
  }

  private syncRuntimeState(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (binding.lastRuntimeState === item.runtimeState) {
      return;
    }
    binding.host.dataset.runtimeState = item.runtimeState;
    binding.lastRuntimeState = item.runtimeState;
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

function paneChromeActionVisible(action: PaneChromeAction, item: PaneRenderItem): boolean {
  if (action === "close" || action === "maximize") {
    return item.visible;
  }
  if (!item.focused || item.presentationMode !== "normal") {
    return false;
  }
  return !item.maximized;
}

function paneActionButtonLabel(action: PaneChromeAction, item: PaneRenderItem): string {
  switch (action) {
    case "add-above":
      return "Add pane above";
    case "add-below":
      return "Add pane below";
    case "close":
      return "Close pane";
    case "maximize":
      return item.maximized ? "Restore pane size" : "Maximize pane";
    case "split-down":
      return "Split pane down";
    default:
      return assertNever(action);
  }
}

function paneActionButtonClassName(action: PaneChromeAction): string {
  const className = `workspace-pane-action-button workspace-pane-action-${action} app-no-drag`;
  return action === "maximize" ? `${className} workspace-pane-maximize-button` : className;
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}

function resizeNeighborItem(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
  axis: PaneResizeAxis,
): PaneRenderItem | null {
  if (!canHostResizeHandle(item)) {
    return null;
  }
  const sourceRect = visualRectForItem(item);
  let best: ResizeNeighborMeasurement | null = null;
  for (const candidate of assignedItems) {
    const measurement = resizeNeighborMeasurement(item, sourceRect, candidate, axis);
    if (!measurement) {
      continue;
    }
    best = nearerResizeNeighbor(best, measurement);
  }
  return best?.item ?? null;
}

function resizeNeighborMeasurement(
  item: PaneRenderItem,
  sourceRect: PaneVisualRect,
  candidate: PaneRenderItem | undefined,
  axis: PaneResizeAxis,
): ResizeNeighborMeasurement | null {
  if (!candidate || candidate.paneId === item.paneId || !canHostResizeHandle(candidate)) {
    return null;
  }
  const candidateRect = visualRectForItem(candidate);
  const gap = resizeNeighborGap(sourceRect, candidateRect, axis);
  if (gap < -1 || gap > maximumResizeNeighborGapPx) {
    return null;
  }
  return resizeNeighborHasOverlap(sourceRect, candidateRect, axis)
    ? { gap, item: candidate }
    : null;
}

function canHostResizeHandle(item: PaneRenderItem): boolean {
  return item.visible && item.presentationMode === "normal" && !item.maximized;
}

function surfaceSyncItem(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
): PaneRenderItem {
  if (
    item.surfaceKind !== "browser" ||
    item.runtimeState !== "live" ||
    !browserNativeViewOccluded(item, assignedItems)
  ) {
    return item;
  }
  return { ...item, runtimeState: "snapshot" };
}

function browserNativeViewOccluded(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
): boolean {
  if (!item.visible || item.opacity <= 0) {
    return false;
  }
  const rect = visualRectForItem(item);
  return assignedItems.some((candidate) => {
    if (!candidate || candidate.paneId === item.paneId || !candidate.visible) {
      return false;
    }
    if (candidate.opacity <= 0 || candidate.z <= item.z) {
      return false;
    }
    return rectsOverlap(rect, visualRectForItem(candidate));
  });
}

function rectsOverlap(left: PaneVisualRect, right: PaneVisualRect): boolean {
  return (
    overlapSize(left.left, left.right, right.left, right.right) > 0 &&
    overlapSize(left.top, left.bottom, right.top, right.bottom) > 0
  );
}

function resizeNeighborGap(
  sourceRect: PaneVisualRect,
  candidateRect: PaneVisualRect,
  axis: PaneResizeAxis,
): number {
  return axis === "horizontal"
    ? candidateRect.left - sourceRect.right
    : candidateRect.top - sourceRect.bottom;
}

function resizeNeighborHasOverlap(
  sourceRect: PaneVisualRect,
  candidateRect: PaneVisualRect,
  axis: PaneResizeAxis,
): boolean {
  const overlap =
    axis === "horizontal"
      ? overlapSize(sourceRect.top, sourceRect.bottom, candidateRect.top, candidateRect.bottom)
      : overlapSize(sourceRect.left, sourceRect.right, candidateRect.left, candidateRect.right);
  const sourceSize = axis === "horizontal" ? rectHeight(sourceRect) : rectWidth(sourceRect);
  const candidateSize =
    axis === "horizontal" ? rectHeight(candidateRect) : rectWidth(candidateRect);
  return overlap >= Math.min(sourceSize, candidateSize) * 0.25 && overlap >= 18;
}

function nearerResizeNeighbor(
  current: ResizeNeighborMeasurement | null,
  candidate: ResizeNeighborMeasurement,
): ResizeNeighborMeasurement {
  return !current || candidate.gap < current.gap ? candidate : current;
}

function positionResizeHandle(
  handle: HTMLElement,
  axis: PaneResizeAxis,
  sourceRect: PaneVisualRect,
  adjacentRect: PaneVisualRect,
): void {
  if (axis === "horizontal") {
    const gap = Math.max(0, adjacentRect.left - sourceRect.right);
    const overlapTop = Math.max(sourceRect.top, adjacentRect.top);
    const overlapBottom = Math.min(sourceRect.bottom, adjacentRect.bottom);
    syncStyleValue(
      handle.style,
      "height",
      `${Math.min(72, Math.max(34, overlapBottom - overlapTop - 20)).toFixed(2)}px`,
    );
    syncStyleValue(handle.style, "left", `${(sourceRect.right + gap / 2).toFixed(2)}px`);
    syncStyleValue(handle.style, "top", `${((overlapTop + overlapBottom) / 2).toFixed(2)}px`);
    syncStyleValue(handle.style, "width", "20px");
    return;
  }
  const gap = Math.max(0, adjacentRect.top - sourceRect.bottom);
  const overlapLeft = Math.max(sourceRect.left, adjacentRect.left);
  const overlapRight = Math.min(sourceRect.right, adjacentRect.right);
  syncStyleValue(handle.style, "height", "20px");
  syncStyleValue(handle.style, "left", `${((overlapLeft + overlapRight) / 2).toFixed(2)}px`);
  syncStyleValue(handle.style, "top", `${(sourceRect.bottom + gap / 2).toFixed(2)}px`);
  syncStyleValue(
    handle.style,
    "width",
    `${Math.min(84, Math.max(42, overlapRight - overlapLeft - 20)).toFixed(2)}px`,
  );
}

function syncStyleValue(
  style: CSSStyleDeclaration,
  property: "height" | "left" | "top" | "width",
  value: string,
): void {
  if (style[property] !== value) {
    style[property] = value;
  }
}

function visualRectForItem(item: PaneRenderItem): PaneVisualRect {
  return {
    bottom: item.y + item.height * item.scale,
    left: item.x,
    right: item.x + item.width * item.scale,
    top: item.y,
  };
}

function overlapSize(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number {
  return Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
}

function rectHeight(rect: PaneVisualRect): number {
  return rect.bottom - rect.top;
}

function rectWidth(rect: PaneVisualRect): number {
  return rect.right - rect.left;
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

function formatPixels(pixels: number | null): string {
  if (pixels === null) {
    return "n/a";
  }
  if (pixels < 1000 * 1000) {
    return `${Math.round(pixels / 1000)}Kpx`;
  }
  return `${(pixels / 1000 / 1000).toFixed(1)}Mpx`;
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
