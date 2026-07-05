import type { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { OVERVIEW_MAX_ZOOM_SCALE, OVERVIEW_MIN_ZOOM } from "./layout-engine-helpers";
import type { OverviewGhostTarget } from "./workspace-overview-ghost";
import type {
  ColumnId,
  ColumnWidthSpec,
  WorkspacePresentationMode,
  WorkspaceScene,
  OpenPaneRequest,
  PaneDropIntent,
  PaneLimitPolicy,
  PaneId,
  PaneInsertionPlacement,
  Rect,
  SurfaceKind,
  TerminalPaneConfig,
} from "./types";

export interface WorkspaceLayoutSnapshot {
  focusedColumnIndex: number;
  focusedPaneId: PaneId;
  focusedRowIndex: number;
  maximizedPaneId: PaneId | null;
  overviewPanX: number;
  overviewPanY: number;
  overviewInsertPreviewTarget: OverviewGhostTarget | null;
  overviewProgress: number;
  overviewZoom: number;
  presentationMode: WorkspacePresentationMode;
  revision: number;
  scrollColumn: number;
  scrollRow: number;
  targetScrollColumn: number;
  targetScrollRow: number;
}

export interface WorkspaceLayoutTransientSnapshot extends WorkspaceLayoutSnapshot {
  focusRevealSuppressed: boolean;
}

type LayoutStoreListener = (snapshot: WorkspaceLayoutSnapshot) => void;
const scrollAnimationTimeConstantMs = 115;
const maxAnimationStepMs = 1000 / 60;
const defaultViewportHeight = 900;

export interface WorkspacePaneLimitState {
  allowed: boolean;
  count: number;
  limit: number | null;
  surfaceKind: SurfaceKind | null;
}

interface WorkspaceLayoutStoreOptions {
  initialRevision?: number;
  initialTransientSnapshot?: WorkspaceLayoutTransientSnapshot;
  paneLimits?: PaneLimitPolicy;
}

export class WorkspaceLayoutStore {
  private focusedColumnIndex = 0;
  private focusedRowIndex = 0;
  private listeners = new Set<LayoutStoreListener>();
  private maximizedPaneId: PaneId | null = null;
  private snapshot: WorkspaceLayoutSnapshot | null = null;
  private scrollColumn = 0;
  private scrollRow = 0;
  private focusRevealSuppressed = false;
  private overviewPanX = 0;
  private overviewPanY = 0;
  private overviewProgress = 0;
  // User zoom factor over the fit-all overview scale (1 = fit). Stays put while a
  // drag/preview is in progress (the engine freezes the fit baseline), and resets
  // when overview is (re-)entered.
  private overviewZoom = 1;
  // The "add pane here" affordance positioned on the exact slot a previewed insert
  // would occupy (null when not hovering an add slot).
  private overviewInsertPreviewTarget: OverviewGhostTarget | null = null;
  private presentationMode: WorkspacePresentationMode = "normal";
  private revision = 0;
  private targetOverviewProgress = 0;
  private targetScrollColumn = 0;
  private targetScrollRow = 0;
  private lastViewport: Rect = { height: defaultViewportHeight, width: 1200, x: 0, y: 0 };

  constructor(
    private readonly engine: WorkspaceLikeLayoutEngine,
    private readonly scene: WorkspaceScene,
    initialFocusedPaneId?: PaneId,
    private readonly options: WorkspaceLayoutStoreOptions = {},
  ) {
    this.revision = nonNegativeInteger(options.initialRevision ?? 0);
    if (initialFocusedPaneId) {
      this.setFocusedPane(initialFocusedPaneId);
      this.snapScrollToTarget();
    }
    if (options.initialTransientSnapshot) {
      this.applyTransientSnapshot(options.initialTransientSnapshot);
    }
  }

  advanceFrame(deltaMs: number): "idle" | "moving" {
    const columnDistance = this.targetScrollColumn - this.scrollColumn;
    const rowDistance = this.targetScrollRow - this.scrollRow;
    const zoomDistance = this.targetOverviewProgress - this.overviewProgress;
    if (
      Math.abs(columnDistance) <= 0.001 &&
      Math.abs(rowDistance) <= 0.001 &&
      Math.abs(zoomDistance) <= 0.001
    ) {
      this.scrollColumn = this.targetScrollColumn;
      this.scrollRow = this.targetScrollRow;
      this.overviewProgress = this.targetOverviewProgress;
      this.snapshot = null;
      return "idle";
    }
    const animationDeltaMs = Math.min(maxAnimationStepMs, Math.max(0, deltaMs));
    const blend = Math.min(1, animationDeltaMs / scrollAnimationTimeConstantMs);
    this.scrollColumn += columnDistance * blend;
    this.scrollRow += rowDistance * blend;
    this.overviewProgress += zoomDistance * blend;
    if (Math.abs(this.targetScrollColumn - this.scrollColumn) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
    if (Math.abs(this.targetScrollRow - this.scrollRow) <= 0.001) {
      this.scrollRow = this.targetScrollRow;
    }
    if (Math.abs(this.targetOverviewProgress - this.overviewProgress) <= 0.001) {
      this.overviewProgress = this.targetOverviewProgress;
    }
    this.snapshot = null;
    return "moving";
  }

  focusedPaneId(): PaneId {
    return this.engine.focusedPaneAt(this.focusedColumnIndex, this.focusedRowIndex);
  }

  visibleColumnCount(): number {
    return this.scene.visibleColumnCount;
  }

  getSnapshot(): WorkspaceLayoutSnapshot {
    if (!this.snapshot) {
      this.snapshot = {
        focusedColumnIndex: this.focusedColumnIndex,
        focusedPaneId: this.focusedPaneId(),
        focusedRowIndex: this.focusedRowIndex,
        maximizedPaneId: this.maximizedPaneId,
        overviewPanX: this.overviewPanX,
        overviewPanY: this.overviewPanY,
        overviewInsertPreviewTarget: this.overviewInsertPreviewTarget,
        overviewProgress: this.overviewProgress,
        overviewZoom: this.overviewZoom,
        presentationMode: this.presentationMode,
        revision: this.revision,
        scrollColumn: this.scrollColumn,
        scrollRow: this.scrollRow,
        targetScrollColumn: this.targetScrollColumn,
        targetScrollRow: this.targetScrollRow,
      };
    }
    return this.snapshot;
  }

  getTransientSnapshot(): WorkspaceLayoutTransientSnapshot {
    return {
      ...this.getSnapshot(),
      focusRevealSuppressed: this.focusRevealSuppressed,
    };
  }

  private createSnapshot(): WorkspaceLayoutSnapshot {
    return {
      focusedColumnIndex: this.focusedColumnIndex,
      focusedPaneId: this.focusedPaneId(),
      focusedRowIndex: this.focusedRowIndex,
      maximizedPaneId: this.maximizedPaneId,
      overviewPanX: this.overviewPanX,
      overviewPanY: this.overviewPanY,
      overviewInsertPreviewTarget: this.overviewInsertPreviewTarget,
      overviewProgress: this.overviewProgress,
      overviewZoom: this.overviewZoom,
      presentationMode: this.presentationMode,
      revision: this.revision,
      scrollColumn: this.scrollColumn,
      scrollRow: this.scrollRow,
      targetScrollColumn: this.targetScrollColumn,
      targetScrollRow: this.targetScrollRow,
    };
  }

  moveFocus(direction: "up" | "down" | "left" | "right", viewport?: Rect): void {
    if (viewport) {
      this.lastViewport = viewport;
    }
    if (!this.moveFocusFromCurrentPane(direction, viewport)) {
      return;
    }
    this.notify();
  }

  moveFocusFromPane(
    paneId: PaneId,
    direction: "up" | "down" | "left" | "right",
    viewport?: Rect,
  ): boolean {
    if (viewport) {
      this.lastViewport = viewport;
    }
    if (!this.engine.paneLocation(paneId)) {
      return false;
    }
    this.setFocusedPane(paneId);
    this.moveFocusFromCurrentPane(direction, viewport);
    this.notify();
    return true;
  }

  private moveFocusFromCurrentPane(
    direction: "up" | "down" | "left" | "right",
    viewport?: Rect,
  ): boolean {
    const visualTargetPaneId = this.visualTargetPaneId(direction, viewport);
    if (visualTargetPaneId) {
      this.setFocusedPane(visualTargetPaneId);
      return true;
    }
    return this.moveFallbackFocus(direction);
  }

  private visualTargetPaneId(
    direction: "up" | "down" | "left" | "right",
    viewport?: Rect,
  ): PaneId | null {
    const navigationViewport =
      viewport ?? (isHorizontalFocusDirection(direction) ? this.lastViewport : undefined);
    return navigationViewport
      ? this.engine.paneInVisualDirection(
          this.focusedPaneId(),
          direction,
          navigationViewport,
          this.maximizedPaneId,
        )
      : null;
  }

  private moveFallbackFocus(direction: "up" | "down" | "left" | "right"): boolean {
    if (isHorizontalFocusDirection(direction)) {
      return false;
    }
    this.focusRevealSuppressed = false;
    if (direction === "up") {
      this.focusedRowIndex = Math.max(0, this.focusedRowIndex - 1);
      this.targetScrollRow = this.targetScrollForFocusedRow();
      return true;
    }
    this.focusedRowIndex = Math.min(this.currentColumnRowCount() - 1, this.focusedRowIndex + 1);
    this.targetScrollRow = this.targetScrollForFocusedRow();
    return true;
  }

  closeFocusedPane(): PaneId | null {
    if (this.engine.paneCount() <= 1) {
      return null;
    }
    const closedPaneId = this.focusedPaneId();
    const closedLocation = this.engine.paneLocation(closedPaneId);
    this.engine.closePane(closedPaneId);
    if (this.maximizedPaneId === closedPaneId) {
      this.maximizedPaneId = null;
    }
    const nextPaneId = closedLocation
      ? this.engine.focusedPaneAt(
          Math.min(closedLocation.columnIndex, Math.max(0, this.engine.columnCount() - 1)),
          closedLocation.rowIndex,
        )
      : this.engine.firstPaneId();
    if (nextPaneId) {
      this.setFocusedPane(nextPaneId);
    }
    this.notify();
    return closedPaneId;
  }

  moveFocusedPane(direction: "up" | "down" | "left" | "right"): PaneId {
    const paneId = this.focusedPaneId();
    this.engine.movePane(paneId, direction);
    this.setFocusedPane(paneId);
    this.notify();
    return paneId;
  }

  openPane(request: OpenPaneRequest): PaneId {
    const limitState = this.paneLimitState(request);
    if (!limitState.allowed) {
      throw new Error(`workspace pane limit reached for ${limitState.surfaceKind}`);
    }
    const columnId = request.columnId;
    const paneId = this.engine.openPane({
      ...request,
      adjacentToColumnId: columnId ? undefined : this.currentColumnId(),
      columnId,
    });
    this.setFocusedPane(paneId);
    this.notify();
    return paneId;
  }

  openEmptyFrame(): PaneId {
    return this.openPane(emptyFramePaneRequest());
  }

  openEmptyFrameNear(paneId: PaneId, placement: PaneInsertionPlacement): PaneId {
    const request = emptyFramePaneRequest();
    const limitState = this.paneLimitState(request);
    if (!limitState.allowed) {
      throw new Error(`workspace pane limit reached for ${limitState.surfaceKind}`);
    }
    const createdPaneId = this.engine.openPaneNearPane(paneId, placement, request);
    this.setFocusedPane(createdPaneId);
    this.notify();
    return createdPaneId;
  }

  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId {
    const limitState = this.paneLimitState(request);
    if (!limitState.allowed && !this.configureKeepsPaneSurfaceKind(paneId, request)) {
      throw new Error(`workspace pane limit reached for ${limitState.surfaceKind}`);
    }
    const configuredPaneId = this.engine.configurePane(paneId, request);
    this.setFocusedPane(configuredPaneId);
    this.notify();
    return configuredPaneId;
  }

  private configureKeepsPaneSurfaceKind(paneId: PaneId, request: OpenPaneRequest): boolean {
    const currentSurfaceKind = this.toScene().paneById.get(paneId)?.surfaceKind;
    if (!currentSurfaceKind) {
      return false;
    }
    return (request.surfaceKind ?? currentSurfaceKind) === currentSurfaceKind;
  }

  configureFocusedPane(request: OpenPaneRequest): PaneId {
    return this.configurePane(this.focusedPaneId(), request);
  }

  canOpenPane(request: OpenPaneRequest): boolean {
    return this.paneLimitState(request).allowed;
  }

  paneLimitState(request: OpenPaneRequest): WorkspacePaneLimitState {
    const surfaceKind = request.surfaceKind ?? null;
    if (!surfaceKind) {
      return {
        allowed: true,
        count: 0,
        limit: null,
        surfaceKind,
      };
    }
    const limit = this.options.paneLimits?.[surfaceKind] ?? null;
    const count = this.toScene().panes.filter((pane) => pane.surfaceKind === surfaceKind).length;
    return {
      allowed: limit === null || count < limit,
      count,
      limit,
      surfaceKind,
    };
  }

  splitFocusedPane(direction: "up" | "down" | "left" | "right"): PaneId {
    const paneId = this.engine.splitPane(this.focusedPaneId(), direction);
    this.setFocusedPane(paneId);
    this.notify();
    return paneId;
  }

  splitFocusedPaneToPlane(direction: "up" | "down"): PaneId {
    const paneId = this.engine.splitPaneToPlane(this.focusedPaneId(), direction);
    this.setFocusedPane(paneId);
    this.notify();
    return paneId;
  }

  ensureFocusedColumnVisible(viewport: Rect): void {
    if (this.presentationMode === "overview") {
      return;
    }
    this.lastViewport = viewport;
    const nextScrollColumn = this.engine.scrollColumnForFocusedColumnVisibility(
      this.focusedColumnIndex,
      this.targetScrollColumn,
      viewport.width,
      this.maximizedPaneId,
    );
    if (Math.abs(nextScrollColumn - this.targetScrollColumn) <= 0.001) {
      return;
    }
    this.targetScrollColumn = nextScrollColumn;
    this.snapshot = null;
  }

  ensureFocusedPaneVisible(viewport: Rect): void {
    if (this.focusRevealSuppressed) {
      this.lastViewport = viewport;
      return;
    }
    this.ensureFocusedColumnVisible(viewport);
    this.ensureFocusedRowVisible(viewport);
  }

  ensureFocusedRowVisible(viewport: Rect): void {
    if (this.presentationMode === "overview") {
      return;
    }
    this.lastViewport = viewport;
    const nextScrollRow = this.targetScrollForFocusedRow();
    if (Math.abs(nextScrollRow - this.targetScrollRow) <= 0.001) {
      return;
    }
    this.targetScrollRow = nextScrollRow;
    this.snapshot = null;
  }

  focusedColumnId(): ColumnId {
    const columnId = this.toScene().columns[this.focusedColumnIndex]?.columnId;
    if (!columnId) {
      throw new Error("workspace layout has no focused column");
    }
    return columnId;
  }

  focusedColumnLocked(): boolean {
    return this.toScene().columns[this.focusedColumnIndex]?.widthSpec.unit === "px";
  }

  focusPaneBySurfaceKind(surfaceKind: SurfaceKind): PaneId | null {
    const pane = this.toScene().panes.find((candidate) => candidate.surfaceKind === surfaceKind);
    if (!pane) {
      return null;
    }
    this.setFocusedPane(pane.paneId);
    this.notify();
    return pane.paneId;
  }

  focusPane(paneId: PaneId): boolean {
    if (!this.engine.paneLocation(paneId)) {
      return false;
    }
    this.setFocusedPane(paneId);
    this.notify();
    return true;
  }

  focusPaneWithoutReveal(paneId: PaneId): boolean {
    if (!this.engine.paneLocation(paneId)) {
      return false;
    }
    const previousTargetScrollColumn = this.targetScrollColumn;
    const previousTargetScrollRow = this.targetScrollRow;
    this.setFocusedPane(paneId);
    this.targetScrollColumn = previousTargetScrollColumn;
    this.targetScrollRow = previousTargetScrollRow;
    this.focusRevealSuppressed = true;
    this.notify();
    return true;
  }

  lockFocusedColumn(viewport: Rect): void {
    this.engine.lockColumnWidth(this.focusedColumnId(), viewport.width);
    this.notify();
  }

  resetFocusedColumnWidth(): void {
    this.engine.resetColumnWidth(this.focusedColumnId());
    this.notify();
  }

  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void {
    this.engine.resizeColumn(columnId, width);
    this.notify();
  }

  resizePaneSplit(
    upperPaneId: PaneId,
    lowerPaneId: PaneId,
    upperHeightWeight: number,
    lowerHeightWeight: number,
  ): boolean {
    if (
      !this.engine.resizePaneSplit(upperPaneId, lowerPaneId, upperHeightWeight, lowerHeightWeight)
    ) {
      return false;
    }
    this.notify();
    return true;
  }

  resizePane(paneId: PaneId, heightPx: number | null): void {
    this.engine.resizePane(paneId, heightPx);
    this.notify();
  }

  resizePaneRow(paneId: PaneId, heightPx: number | null): boolean {
    const source = this.engine.paneLocation(paneId);
    if (!source) {
      return false;
    }
    const scene = this.toScene();
    let resized = false;
    for (const column of scene.columns) {
      if (column.planeIndex !== source.planeIndex) {
        continue;
      }
      const rowPaneId = column.paneIds[source.rowIndex];
      if (!rowPaneId) {
        continue;
      }
      this.engine.resizePane(rowPaneId, heightPx);
      resized = true;
    }
    if (!resized) {
      return false;
    }
    this.notify();
    return true;
  }

  renamePane(paneId: PaneId, title: string): boolean {
    if (!this.engine.renamePane(paneId, title)) {
      return false;
    }
    this.setFocusedPane(paneId);
    this.notify();
    return true;
  }

  previewPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    if (!this.engine.previewPaneDropIntent(sourcePaneId, intent)) {
      return false;
    }
    this.notify();
    return true;
  }

  clearPaneDropPreview(): boolean {
    if (!this.engine.clearPaneReorderPreview()) {
      return false;
    }
    this.notify();
    return true;
  }

  hasPaneDropPreview(): boolean {
    return this.engine.hasPaneReorderPreview();
  }

  setPaneTerminalConfig(paneId: PaneId, terminalConfig: TerminalPaneConfig): void {
    this.engine.setPaneTerminalConfig(paneId, terminalConfig);
    this.notify();
  }

  resizePaneColumn(paneId: PaneId, width: ColumnWidthSpec): ColumnId | null {
    const columnId = this.toScene().paneById.get(paneId)?.columnId;
    if (!columnId) {
      return null;
    }
    this.engine.resizeColumn(columnId, width);
    this.notify();
    return columnId;
  }

  applyPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    if (!this.engine.applyPaneDropIntent(sourcePaneId, intent)) {
      return false;
    }
    if (intent.kind !== "swap") {
      this.setFocusedPane(sourcePaneId);
    }
    // A swap exchanges two panes in place, so focus is intentionally left on the
    // current slot (now occupied by the other pane). Re-focusing the moved source
    // would snap the focused column to its anchor and jump the whole row sideways
    // -- the opposite of an in-place swap.
    this.notify();
    return true;
  }

  scrollToColumn(columnIndex: number): void {
    const maxColumn = Math.max(0, this.engine.columnCount() - 1);
    this.targetScrollColumn = Math.min(maxColumn, Math.max(0, columnIndex));
    this.notify();
  }

  snapScrollToTarget(): void {
    this.scrollColumn = this.targetScrollColumn;
    this.scrollRow = this.targetScrollRow;
    this.snapshot = null;
  }

  toScene(): WorkspaceScene {
    return this.engine.toScene(this.scene.id);
  }

  toggleFocusedColumnLock(viewport: Rect): void {
    if (this.focusedColumnLocked()) {
      this.unlockFocusedColumn(viewport);
      return;
    }
    this.lockFocusedColumn(viewport);
  }

  togglePaneMaximized(paneId: PaneId): void {
    if (!this.engine.paneLocation(paneId)) {
      return;
    }
    this.maximizedPaneId = this.maximizedPaneId === paneId ? null : paneId;
    this.setFocusedPane(paneId);
    this.notify();
  }

  toggleOverviewMode(): void {
    this.presentationMode = this.presentationMode === "overview" ? "normal" : "overview";
    this.targetOverviewProgress = this.presentationMode === "overview" ? 1 : 0;
    // A fresh overview always starts centered/edge-aligned and fit-all; the
    // previous pan/zoom has no meaning for a different mode or a re-entry.
    this.overviewPanX = 0;
    this.overviewPanY = 0;
    this.overviewZoom = 1;
    this.overviewInsertPreviewTarget = null;
    this.engine.clearInsertFramePreview();
    this.notify();
  }

  // Live-preview inserting a new empty frame next to an anchor pane: the overview
  // reflows as if the pane existed, and the "add pane" affordance is positioned on
  // the exact slot it will occupy. Non-committing. No-op outside overview. Returns
  // true when the previewed slot actually changed.
  previewInsertFrame(
    anchorPaneId: PaneId,
    placement: PaneInsertionPlacement,
    viewport: Rect,
  ): boolean {
    if (this.presentationMode !== "overview") {
      return false;
    }
    this.lastViewport = viewport;
    if (!this.engine.previewInsertFrame(anchorPaneId, placement)) {
      return false;
    }
    const rect = this.engine.overviewInsertPreviewBounds(
      viewport,
      this.maximizedPaneId,
      this.overviewZoom,
      this.overviewPanX,
      this.overviewPanY,
    );
    this.overviewInsertPreviewTarget = rect
      ? {
          height: rect.height,
          left: rect.left,
          paneId: anchorPaneId,
          placement,
          top: rect.top,
          width: rect.width,
        }
      : null;
    this.notify();
    return true;
  }

  clearInsertFramePreview(): boolean {
    if (!this.engine.clearInsertFramePreview()) {
      return false;
    }
    this.overviewInsertPreviewTarget = null;
    this.notify();
    return true;
  }

  hasInsertFramePreview(): boolean {
    return this.engine.hasInsertFramePreview();
  }

  insertFramePreview(): { anchorPaneId: PaneId; placement: PaneInsertionPlacement } | null {
    return this.engine.insertFramePreview();
  }

  // Scroll (pan) the overview surface by a screen-pixel delta so panes that fall
  // outside the viewport at the fitted scale can be brought into view. No-op
  // outside overview. Returns true when the pan actually changed.
  panOverviewBy(deltaX: number, deltaY: number, viewport: Rect): boolean {
    if (this.presentationMode !== "overview") {
      return false;
    }
    this.lastViewport = viewport;
    const bounds = this.engine.overviewContentBounds(
      viewport,
      this.maximizedPaneId,
      this.overviewZoom,
    );
    const nextPanX = clampPan(this.overviewPanX + deltaX, bounds.maxPanX);
    const nextPanY = clampPan(this.overviewPanY + deltaY, bounds.maxPanY);
    if (nextPanX === this.overviewPanX && nextPanY === this.overviewPanY) {
      return false;
    }
    this.overviewPanX = nextPanX;
    this.overviewPanY = nextPanY;
    this.notify();
    return true;
  }

  // Multiply the overview zoom by `zoomFactor` (>1 zooms in, <1 out), keeping the
  // surface point under (focalX, focalY) screen-fixed (zoom-to-cursor). The
  // effective scale is clamped to [fit-all, OVERVIEW_MAX_ZOOM_SCALE]; pan is
  // re-clamped to the new (zoomed) content bounds. No-op outside overview.
  // Returns true when the zoom actually changed.
  zoomOverviewBy(zoomFactor: number, focalX: number, focalY: number, viewport: Rect): boolean {
    if (this.presentationMode !== "overview") {
      return false;
    }
    if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
      return false;
    }
    this.lastViewport = viewport;
    const before = this.engine.overviewContentBounds(
      viewport,
      this.maximizedPaneId,
      this.overviewZoom,
    );
    if (before.fitScale <= 0 || before.scale <= 0) {
      return false;
    }
    const maxZoom = Math.max(1, OVERVIEW_MAX_ZOOM_SCALE / before.fitScale);
    const nextZoom = clampRange(this.overviewZoom * zoomFactor, OVERVIEW_MIN_ZOOM, maxZoom);
    if (Math.abs(nextZoom - this.overviewZoom) < 0.0001) {
      return false;
    }
    // Surface coordinate currently under the focal point (overview forces
    // scrollColumn/scrollRow to 0, so screen = base - pan + surface * scale).
    const surfaceX = (focalX - (before.baseXOffset - this.overviewPanX)) / before.scale;
    const surfaceY = (focalY - (before.baseYOffset - this.overviewPanY)) / before.scale;
    this.overviewZoom = nextZoom;
    const after = this.engine.overviewContentBounds(
      viewport,
      this.maximizedPaneId,
      this.overviewZoom,
    );
    this.overviewPanX = clampPan(
      after.baseXOffset + surfaceX * after.scale - focalX,
      after.maxPanX,
    );
    this.overviewPanY = clampPan(
      after.baseYOffset + surfaceY * after.scale - focalY,
      after.maxPanY,
    );
    this.notify();
    return true;
  }

  subscribe(listener: LayoutStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.revision += 1;
    const snapshot = this.createSnapshot();
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private currentColumnId(): ColumnId | undefined {
    return this.toScene().columns[this.focusedColumnIndex]?.columnId;
  }

  private currentColumnRowCount(): number {
    return Math.max(1, this.toScene().columns[this.focusedColumnIndex]?.paneIds.length ?? 1);
  }

  private setFocusedPane(paneId: PaneId): void {
    const location = this.engine.paneLocation(paneId);
    if (!location) {
      return;
    }
    this.focusedColumnIndex = location.columnIndex;
    this.focusedRowIndex = location.rowIndex;
    this.focusRevealSuppressed = false;
    if (this.presentationMode === "overview") {
      return;
    }
    this.targetScrollColumn = this.targetScrollForFocusedColumn();
    this.targetScrollRow = this.targetScrollForFocusedRow();
    if (Math.abs(this.scrollColumn - this.targetScrollColumn) < 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
    if (Math.abs(this.scrollRow - this.targetScrollRow) < 0.001) {
      this.scrollRow = this.targetScrollRow;
    }
  }

  private applyTransientSnapshot(snapshot: WorkspaceLayoutTransientSnapshot): void {
    const focusedPaneId = this.focusedPaneId();
    if (snapshot.focusedPaneId !== focusedPaneId) {
      throw new Error(
        `workspace transient layout snapshot focused pane ${snapshot.focusedPaneId} does not match restored focused pane ${focusedPaneId}`,
      );
    }
    if (snapshot.maximizedPaneId !== null && !this.engine.paneLocation(snapshot.maximizedPaneId)) {
      throw new Error(
        `workspace transient layout snapshot maximized pane ${snapshot.maximizedPaneId} is not present in the restored scene`,
      );
    }
    if (
      snapshot.overviewInsertPreviewTarget !== null &&
      !this.engine.paneLocation(snapshot.overviewInsertPreviewTarget.paneId)
    ) {
      throw new Error(
        `workspace transient layout snapshot preview pane ${snapshot.overviewInsertPreviewTarget.paneId} is not present in the restored scene`,
      );
    }
    this.maximizedPaneId = snapshot.maximizedPaneId;
    this.overviewPanX = snapshot.overviewPanX;
    this.overviewPanY = snapshot.overviewPanY;
    this.overviewInsertPreviewTarget = snapshot.overviewInsertPreviewTarget;
    this.overviewProgress = snapshot.overviewProgress;
    this.overviewZoom = snapshot.overviewZoom;
    this.presentationMode = snapshot.presentationMode;
    this.scrollColumn = snapshot.scrollColumn;
    this.scrollRow = snapshot.scrollRow;
    this.targetScrollColumn = snapshot.targetScrollColumn;
    this.targetScrollRow = snapshot.targetScrollRow;
    this.focusRevealSuppressed = snapshot.focusRevealSuppressed;
    this.snapshot = null;
  }

  private targetScrollForFocusedColumn(): number {
    return this.engine.horizontalScrollColumnForPane(this.focusedPaneId());
  }

  private targetScrollForFocusedRow(): number {
    return this.engine.verticalScrollOffsetForPane(
      this.focusedPaneId(),
      this.lastViewport.height,
      this.maximizedPaneId,
    );
  }

  private unlockFocusedColumn(viewport: Rect): void {
    this.engine.unlockColumnWidth(this.focusedColumnId(), viewport.width);
    this.notify();
  }
}

function clampPan(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function nonNegativeInteger(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`workspace layout initial revision must be a non-negative integer: ${value}`);
  }
  return value;
}

function emptyFramePaneRequest(): OpenPaneRequest {
  return {
    subtitle: "choose a pane type",
    surfaceKind: "empty-frame",
    title: "New frame",
    tone: "slate",
  };
}

function isHorizontalFocusDirection(direction: "up" | "down" | "left" | "right"): boolean {
  return direction === "left" || direction === "right";
}
