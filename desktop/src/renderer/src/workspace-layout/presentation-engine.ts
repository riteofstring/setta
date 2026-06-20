import type { WorkspaceMetricsCollector } from "./metrics";
import type { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import {
  emptyHostFrameState,
  emptyPaneIdentityState,
  hiddenHostFrameState,
  hiddenPaneChromeState,
  hostFrameStateForItem,
  overlapSize,
  paneActionButtonClassName,
  paneActionButtonLabel,
  paneChromeActionVisible,
  paneChromeActions,
  paneChromeStateForItem,
  positionResizeHandle,
  rectHeight,
  rectWidth,
  resizeHandleStateForItems,
  samePaneActionButtonState,
  samePaneChromeState,
  samePaneIdentityState,
  sameResizeHandleState,
  syncAttributeValue,
  syncDatasetValue,
  syncElementProperty,
  syncStyleValue,
  visualRectForItem,
  type HostFrameState,
  type PaneActionButtonState,
  type PaneChromeAction,
  type PaneChromeState,
  type PaneIdentityState,
  type PaneResizeAxis,
  type PaneVisualRect,
  type ResizeHandleState,
} from "./presentation-engine-state";
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
  actionButtonStates: Partial<Record<PaneChromeAction, PaneActionButtonState>>;
  chromeState: PaneChromeState | null;
  contentPaneId: string | null;
  frameState: HostFrameState;
  host: HTMLElement;
  identityState: PaneIdentityState | null;
  resizeHandleStates: Partial<Record<PaneResizeAxis, ResizeHandleState>>;
}

interface ResizeNeighborMeasurement {
  gap: number;
  item: PaneRenderItem;
}

const maximumResizeNeighborGapPx = 48;

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
    const presentationMark = markPresentationApplyStart(items, options);
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
    markPresentationApplyEnd(presentationMark, writeCounts);
    return writeCounts;
  }

  mount(hosts: readonly HTMLElement[], debugOverlay: HTMLElement | null): void {
    this.bindings = hosts.map((host) => ({
      actionButtonStates: {},
      chromeState: null,
      contentPaneId: host.dataset.paneId ?? null,
      frameState: emptyHostFrameState(),
      host,
      identityState: null,
      resizeHandleStates: {},
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
    if (binding.contentPaneId !== null) {
      this.surfaceRegistry.releaseHost(binding.host);
    }
    this.removeResizeHandles(binding.host);
    binding.contentPaneId = null;
    this.syncPaneIdentity(binding, emptyPaneIdentityState());
    this.syncHostFrameState(binding, hiddenHostFrameState());
    this.syncPaneChromeState(binding, hiddenPaneChromeState());
    binding.actionButtonStates = {};
    binding.resizeHandleStates = {};
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
    syncDatasetValue(topBar, "paneId", item.paneId);

    const dragHandle = this.ensureDragHandle(topBar);
    syncDatasetValue(dragHandle, "paneId", item.paneId);

    const actionStrip = this.ensurePaneActionStrip(topBar);
    syncDatasetValue(actionStrip, "paneId", item.paneId);
    let visibleActionCount = 0;
    for (const action of paneChromeActions) {
      const button = this.ensurePaneActionButton(actionStrip, action);
      const visible = paneChromeActionVisible(action, item);
      if (visible) {
        visibleActionCount += 1;
      }
      this.syncPaneActionButton(binding, button, action, item, visible);
    }
    syncDatasetValue(
      actionStrip,
      "workspacePaneControlsVisible",
      visibleActionCount > 0 ? "true" : "false",
    );

    this.syncResizeHandle(
      binding,
      binding.host,
      item,
      "horizontal",
      resizeNeighborItem(item, assignedItems, "horizontal"),
    );
    this.syncResizeHandle(
      binding,
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
    topBar.dataset.workspacePresentationOwner = "pane-top-bar";
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
    button.dataset.workspacePresentationOwner = "pane-drag-handle";
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
    actionStrip.dataset.workspacePresentationOwner = "pane-action-strip";
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
    button.dataset.workspacePresentationOwner = `pane-action-${action}`;
    button.dataset.workspacePaneAction = action;
    if (action === "maximize") {
      button.dataset.workspacePaneMaximizeButton = "true";
    }
    button.type = "button";
    actionStrip.append(button);
    return button;
  }

  private syncPaneActionButton(
    binding: PaneHostBinding,
    button: HTMLButtonElement,
    action: PaneChromeAction,
    item: PaneRenderItem,
    visible: boolean,
  ): void {
    const label = paneActionButtonLabel(action, item);
    const nextState: PaneActionButtonState = {
      label,
      paneId: item.paneId,
      visible,
    };
    if (samePaneActionButtonState(binding.actionButtonStates[action] ?? null, nextState)) {
      return;
    }
    syncDatasetValue(button, "paneId", item.paneId);
    syncAttributeValue(button, "aria-label", label);
    syncElementProperty(button, "title", label);
    syncElementProperty(button, "disabled", !visible);
    syncElementProperty(button, "tabIndex", visible ? 0 : -1);
    syncStyleValue(button.style, "display", visible ? "" : "none");
    syncAttributeValue(button, "aria-hidden", visible ? "false" : "true");
    binding.actionButtonStates[action] = nextState;
  }

  private syncResizeHandle(
    binding: PaneHostBinding,
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
      delete binding.resizeHandleStates[axis];
      return;
    }
    const handle = existing ?? this.createResizeHandle(host, axis);
    const label = axis === "horizontal" ? "Resize adjacent columns" : "Resize stacked panes";
    const nextState = resizeHandleStateForItems(item, adjacentItem, axis, label);
    if (sameResizeHandleState(binding.resizeHandleStates[axis] ?? null, nextState)) {
      return;
    }
    syncDatasetValue(handle, "paneId", item.paneId);
    syncDatasetValue(handle, "adjacentPaneId", adjacentItem.paneId);
    syncAttributeValue(handle, "aria-label", label);
    syncElementProperty(handle, "title", label);
    positionResizeHandle(handle, nextState);
    binding.resizeHandleStates[axis] = nextState;
  }

  private createResizeHandle(host: HTMLElement, axis: PaneResizeAxis): HTMLElement {
    const handle = host.ownerDocument.createElement("div");
    handle.className = `workspace-pane-resize-handle workspace-pane-resize-handle-${axis} app-no-drag`;
    handle.dataset.workspacePresentationOwner = `pane-resize-${axis}`;
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
    this.syncPaneIdentity(binding, {
      paneId: item.paneId,
      tone: pane.tone,
    });
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
    const frameState = hostFrameStateForItem(item);
    writeCounts.transformWrites = this.syncTransform(binding, frameState);
    writeCounts.boxWrites = this.syncBox(binding, frameState);
    this.syncLayer(binding, frameState);
    this.syncPaneChromeState(binding, paneChromeStateForItem(item));
    return writeCounts;
  }

  private syncPaneIdentity(binding: PaneHostBinding, nextState: PaneIdentityState): void {
    if (samePaneIdentityState(binding.identityState, nextState)) {
      return;
    }
    syncDatasetValue(binding.host, "paneId", nextState.paneId);
    syncDatasetValue(binding.host, "tone", nextState.tone);
    binding.identityState = nextState;
  }

  private syncHostFrameState(binding: PaneHostBinding, nextState: HostFrameState): void {
    this.syncTransform(binding, nextState);
    this.syncLayer(binding, nextState);
    this.syncPointerEvents(binding, nextState);
  }

  private syncBox(binding: PaneHostBinding, nextState: HostFrameState): number {
    let boxWrites = 0;
    if (nextState.width !== null && binding.frameState.width !== nextState.width) {
      binding.host.style.width = `${nextState.width.toFixed(2)}px`;
      binding.frameState.width = nextState.width;
      boxWrites += 1;
    }
    if (nextState.height !== null && binding.frameState.height !== nextState.height) {
      binding.host.style.height = `${nextState.height.toFixed(2)}px`;
      binding.frameState.height = nextState.height;
      boxWrites += 1;
    }
    return boxWrites;
  }

  private syncLayer(binding: PaneHostBinding, nextState: HostFrameState): void {
    if (nextState.opacity !== null && binding.frameState.opacity !== nextState.opacity) {
      binding.host.style.opacity = nextState.opacity.toFixed(3);
      binding.frameState.opacity = nextState.opacity;
    }
    if (nextState.z !== null && binding.frameState.z !== nextState.z) {
      binding.host.style.zIndex = String(nextState.z);
      binding.frameState.z = nextState.z;
    }
  }

  private syncPaneChromeState(binding: PaneHostBinding, nextState: PaneChromeState): void {
    if (samePaneChromeState(binding.chromeState, nextState)) {
      return;
    }
    syncDatasetValue(binding.host, "focused", String(nextState.focused));
    syncDatasetValue(binding.host, "maximized", String(nextState.maximized));
    syncDatasetValue(binding.host, "moving", String(nextState.moving));
    syncDatasetValue(binding.host, "presentationMode", nextState.presentationMode);
    syncDatasetValue(binding.host, "runtimeState", nextState.runtimeState);
    syncDatasetValue(binding.host, "visible", String(nextState.visible));
    binding.chromeState = nextState;
    this.syncPointerEvents(binding, {
      ...binding.frameState,
      pointerEvents: nextState.visible ? "auto" : "none",
    });
  }

  private syncPointerEvents(binding: PaneHostBinding, nextState: HostFrameState): void {
    if (
      nextState.pointerEvents !== null &&
      binding.frameState.pointerEvents !== nextState.pointerEvents
    ) {
      binding.host.style.pointerEvents = nextState.pointerEvents;
      binding.frameState.pointerEvents = nextState.pointerEvents;
    }
  }

  private syncTransform(binding: PaneHostBinding, nextState: HostFrameState): number {
    if (nextState.transform !== null && binding.frameState.transform !== nextState.transform) {
      binding.host.style.transform = nextState.transform;
      binding.frameState.transform = nextState.transform;
      return 1;
    }
    return 0;
  }
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

let nextPresentationApplySequence = 1;

function markPresentationApplyStart(
  items: readonly PaneRenderItem[],
  options: PresentationApplyOptions,
): { endMarkName: string; startMarkName: string } | null {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return null;
  }
  if (
    typeof globalThis.window === "undefined" ||
    globalThis.window.__settaWorkflowGraphPerformanceRecorder === undefined
  ) {
    return null;
  }
  const sequence = nextPresentationApplySequence;
  nextPresentationApplySequence += 1;
  const startMarkName = `setta.workspace.presentation.apply.start.${sequence}`;
  const endMarkName = `setta.workspace.presentation.apply.end.${sequence}`;
  performance.mark(startMarkName, {
    detail: {
      itemCount: items.length,
      resizePhase: options.resizePhase,
      sequence,
    },
  });
  return { endMarkName, startMarkName };
}

function markPresentationApplyEnd(
  mark: { endMarkName: string; startMarkName: string } | null,
  writeCounts: PresentationWriteCounts,
): void {
  if (
    mark === null ||
    typeof performance === "undefined" ||
    typeof performance.mark !== "function"
  ) {
    return;
  }
  performance.mark(mark.endMarkName, { detail: writeCounts });
  if (typeof performance.measure !== "function") {
    return;
  }
  performance.measure("setta.workspace.presentation.apply", {
    detail: writeCounts,
    end: mark.endMarkName,
    start: mark.startMarkName,
  });
  performance.clearMarks?.(mark.startMarkName);
  performance.clearMarks?.(mark.endMarkName);
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
