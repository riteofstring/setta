import type { WorkspaceMetricsCollector } from "./metrics";
import type { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import {
  canHostResizeHandle,
  paneActionButtonClassName,
  paneActionButtonLabel,
  paneActionStateKey,
  paneChromeActions,
  paneChromeActionVisible,
  paneControlsLayoutKey,
  paneResizeHandleStateKey,
  positionHeightResizeHandle,
  positionResizeHandle,
  resizeNeighborItem,
  surfaceSyncItem,
  type PaneChromeAction,
  type PaneResizeAxis,
  visualRectForItem,
} from "./presentation-pane-controls";
import { syncDropPreviewOverlay } from "./presentation-drop-preview";
import {
  addPresentationWriteCounts,
  emptyPresentationWriteCounts,
} from "./presentation-write-counts";
import { SurfaceRegistry, type SurfaceViewportSyncStats } from "./surface-registry";
import { paneChromeTitleModel, paneTitleOverrideFromHost } from "./pane-title-metadata";
import { createPaneTitleSlot, syncPaneTitleSlot } from "./pane-title-icons";
import { notifyReactDomSurfaceHostChanged } from "./react-dom-surface-events";
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
  lastPaneActionKey: string;
  lastPlaneIndex: number | null;
  lastPresentationMode: string | null;
  lastResizeKey: string;
  lastRuntimeState: string | null;
  lastTransform: string;
  lastVisible: boolean | null;
  lastWidth: number;
  lastZ: number;
}

export class PresentationEngine {
  private bindings: PaneHostBinding[] = [];
  private debugOverlay: HTMLElement | null = null;
  private dropPreviewOverlay: HTMLElement | null = null;
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
    const assignedItemsKey = paneControlsLayoutKey(assignedItems);
    this.nativeViewBoundsBatcher?.beginFrame();

    for (let index = 0; index < this.bindings.length; index += 1) {
      const binding = this.bindings[index];
      if (!binding) {
        continue;
      }
      const item = assignedItems[index];
      addPresentationWriteCounts(
        writeCounts,
        this.applyBinding(binding, item, assignedItems, assignedItemsKey, options),
      );
    }

    syncDropPreviewOverlay({
      assignedItems,
      bindings: this.bindings,
      isActivePaneDragSource: (binding) => this.hostIsActivePaneDragSource(binding),
      overlay: this.dropPreviewOverlay,
    });
    const nativeFlush = this.nativeViewBoundsBatcher?.flush();
    writeCounts.nativeBoundsUpdates = nativeFlush?.batchSent ? 1 : 0;
    return writeCounts;
  }

  mount(hosts: readonly HTMLElement[], debugOverlay: HTMLElement | null): void {
    this.syncHosts(hosts);
    this.debugOverlay = debugOverlay;
  }

  syncHosts(hosts: readonly HTMLElement[]): void {
    this.bindings = hosts.map((host) => ({
      contentPaneId: host.dataset.paneId ?? null,
      host,
      lastFocused: null,
      lastHeight: -1,
      lastMaximized: null,
      lastMoving: null,
      lastOpacity: -1,
      lastPaneActionKey: "",
      lastPlaneIndex: null,
      lastPresentationMode: null,
      lastResizeKey: "",
      lastRuntimeState: null,
      lastTransform: "",
      lastVisible: null,
      lastWidth: -1,
      lastZ: -1,
    }));
  }

  setDebugOverlay(debugOverlay: HTMLElement | null): void {
    if (this.debugOverlay && this.debugOverlay !== debugOverlay) {
      this.debugOverlay.textContent = "";
    }
    this.debugOverlay = debugOverlay;
  }

  setDropPreviewOverlay(dropPreviewOverlay: HTMLElement | null): void {
    if (this.dropPreviewOverlay && this.dropPreviewOverlay !== dropPreviewOverlay) {
      this.dropPreviewOverlay.dataset.visible = "false";
    }
    this.dropPreviewOverlay = dropPreviewOverlay;
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
    if (this.dropPreviewOverlay) {
      this.dropPreviewOverlay.dataset.visible = "false";
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
    this.dropPreviewOverlay = null;
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
      `snapshot ${snapshot.snapshotFreshTextureUses}/${snapshot.snapshotStaleTextureUses}/${snapshot.snapshotMissingTextureUses}/${snapshot.snapshotCaptureRequestsDuringTransition}`,
      `runtime ${runtimeSummary.live}/${runtimeSummary.snapshot}/${runtimeSummary.liveThrottled}/${runtimeSummary.hidden}`,
      `budget heavy ${runtimeSummary.budget.maxLiveHeavyDomPanes} snapshot ${runtimeSummary.budget.maxSnapshotPanes}`,
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
      if (this.bindingIsAvailableForAssignment(index, assignedBindingIndexes, "empty")) {
        return index;
      }
    }
    for (let index = 0; index < this.bindings.length; index += 1) {
      if (this.bindingIsAvailableForAssignment(index, assignedBindingIndexes, "any")) {
        return index;
      }
    }
    return null;
  }

  private bindingIsAvailableForAssignment(
    index: number,
    assignedBindingIndexes: ReadonlySet<number>,
    mode: "any" | "empty",
  ): boolean {
    const binding = this.bindings[index];
    if (!binding || assignedBindingIndexes.has(index) || this.hostIsActivePaneDragSource(binding)) {
      return false;
    }
    return mode === "any" || binding.contentPaneId === null;
  }

  private applyBinding(
    binding: PaneHostBinding,
    item: PaneRenderItem | undefined,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
    assignedItemsKey: string,
    options: PresentationApplyOptions,
  ): PresentationWriteCounts {
    if (!item) {
      if (this.hostIsActivePaneDragSource(binding)) {
        return emptyPresentationWriteCounts();
      }
      this.hideBinding(binding);
      return emptyPresentationWriteCounts();
    }
    const writeCounts = this.shouldSyncContent(binding, item, options)
      ? addPresentationWriteCounts(
          this.syncContent(binding, item, assignedItems, options),
          this.syncFrame(binding, item),
        )
      : this.syncFrame(binding, item);
    this.syncPaneControls(binding, item, assignedItems, assignedItemsKey);
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
    binding.host.dataset.planeIndex = "";
    binding.host.style.opacity = "0";
    binding.host.style.pointerEvents = "none";
    binding.lastFocused = false;
    binding.lastMaximized = false;
    binding.lastMoving = false;
    binding.lastOpacity = 0;
    binding.lastPlaneIndex = null;
    binding.lastResizeKey = "";
    binding.host.dataset.visible = "false";
    binding.lastVisible = false;
  }

  private syncPaneControls(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
    assignedItemsKey: string,
  ): void {
    const pane = this.paneById.get(item.paneId);
    if (!pane) {
      throw new Error(`missing pane controls metadata for ${item.paneId}`);
    }
    const topBar = this.ensurePaneTopBar(binding.host);
    topBar.dataset.paneId = item.paneId;
    topBar.dataset.workspacePaneDragHandle = "true";
    const dragHandle = this.ensureDragHandle(topBar);
    dragHandle.dataset.paneId = item.paneId;
    const title = this.ensurePaneTitle(topBar);
    syncPaneTitleSlot(title, paneChromeTitleModel(pane, paneTitleOverrideFromHost(binding.host)));
    const actionStrip = this.ensurePaneActionStrip(topBar);
    const paneActionKey = paneActionStateKey(item);
    if (
      binding.lastPaneActionKey !== paneActionKey ||
      actionStrip.dataset.paneId !== item.paneId ||
      actionStrip.childElementCount !== paneChromeActions.length
    ) {
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
      binding.lastPaneActionKey = paneActionKey;
    }

    this.syncResizeHandles(binding, item, assignedItems, assignedItemsKey);
  }

  private syncResizeHandles(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
    assignedItemsKey: string,
  ): void {
    const resizeKey = paneResizeHandleStateKey(item, assignedItemsKey);
    if (binding.lastResizeKey === resizeKey) {
      return;
    }
    binding.lastResizeKey = resizeKey;
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
    this.syncHeightResizeHandle(binding.host, item);
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

  private ensurePaneTitle(topBar: HTMLElement): HTMLElement {
    const existing = this.paneTitleForTopBar(topBar);
    if (existing) {
      return existing;
    }
    const title = createPaneTitleSlot(topBar.ownerDocument);
    topBar.prepend(title);
    return title;
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
    const reactSurface = Array.from(topBar.parentElement?.children ?? []).find((child) =>
      child.classList.contains("workspace-react-dom-surface"),
    );
    if (reactSurface) {
      notifyReactDomSurfaceHostChanged(reactSurface);
    }
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

  private syncHeightResizeHandle(host: HTMLElement, item: PaneRenderItem): void {
    const existing = this.resizeHandleForHost(host, "height");
    if (!canHostResizeHandle(item)) {
      if (existing) {
        this.removeResizeHandle(host, "height");
      }
      return;
    }
    const handle = existing ?? this.createResizeHandle(host, "height");
    handle.dataset.paneId = item.paneId;
    delete handle.dataset.adjacentPaneId;
    handle.setAttribute("aria-label", "Resize pane height");
    handle.title = "Resize pane height";
    positionHeightResizeHandle(handle, visualRectForItem(item));
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

  private paneTitleForTopBar(topBar: HTMLElement): HTMLElement | null {
    const existing = Array.from(topBar.children).find((child) =>
      child.classList.contains("workspace-pane-title-slot"),
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
    if (this.hostIsActivePaneDragSource(binding, item.paneId)) {
      return emptyPresentationWriteCounts();
    }
    if (
      binding.contentPaneId !== item.paneId &&
      !this.hostContentMissing(binding) &&
      !this.contentSyncAllowedDuringMovement(item, options)
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

  private shouldSyncContent(
    binding: PaneHostBinding,
    item: PaneRenderItem,
    options: PresentationApplyOptions,
  ): boolean {
    return (
      this.hostContentMissing(binding) ||
      binding.contentPaneId === item.paneId ||
      this.contentSyncAllowedDuringMovement(item, options)
    );
  }

  private contentSyncAllowedDuringMovement(
    item: PaneRenderItem,
    options: PresentationApplyOptions,
  ): boolean {
    return (
      options.resizePhase !== "idle" ||
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
    if (this.hostIsActivePaneDragSource(binding, item.paneId)) {
      return writeCounts;
    }
    writeCounts.transformWrites = this.syncTransform(binding, item);
    writeCounts.boxWrites = this.syncBox(binding, item);
    this.syncLayer(binding, item);
    this.syncState(binding, item);
    return writeCounts;
  }

  private hostIsActivePaneDragSource(
    binding: PaneHostBinding,
    paneId = binding.contentPaneId,
  ): boolean {
    return (
      binding.host.dataset.dragSource === "true" &&
      paneId !== null &&
      binding.contentPaneId === paneId
    );
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
    this.syncPlaneIndex(binding, item);
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

  private syncPlaneIndex(binding: PaneHostBinding, item: PaneRenderItem): void {
    if (item.planeIndex === undefined || binding.lastPlaneIndex === item.planeIndex) {
      return;
    }
    binding.host.dataset.planeIndex = String(item.planeIndex);
    binding.lastPlaneIndex = item.planeIndex;
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
