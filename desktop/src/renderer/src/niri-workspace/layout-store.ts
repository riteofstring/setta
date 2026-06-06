import type { NiriLikeLayoutEngine } from "./layout-engine";
import type {
  ColumnId,
  ColumnWidthSpec,
  NiriPresentationMode,
  NiriWorkspaceScene,
  OpenPaneRequest,
  PaneLimitPolicy,
  PaneId,
  Rect,
  SurfaceKind,
} from "./types";

export interface NiriLayoutSnapshot {
  focusedColumnIndex: number;
  focusedPaneId: PaneId;
  focusedRowIndex: number;
  maximizedPaneId: PaneId | null;
  overviewProgress: number;
  presentationMode: NiriPresentationMode;
  scrollColumn: number;
  scrollRow: number;
  targetScrollColumn: number;
  targetScrollRow: number;
}

type LayoutStoreListener = (snapshot: NiriLayoutSnapshot) => void;
const scrollAnimationTimeConstantMs = 140;
const defaultViewportHeight = 900;

export interface NiriPaneLimitState {
  allowed: boolean;
  count: number;
  limit: number | null;
  surfaceKind: SurfaceKind | null;
}

interface NiriLayoutStoreOptions {
  paneLimits?: PaneLimitPolicy;
}

export class NiriLayoutStore {
  private focusedColumnIndex = 0;
  private focusedRowIndex = 0;
  private listeners = new Set<LayoutStoreListener>();
  private maximizedPaneId: PaneId | null = null;
  private snapshot: NiriLayoutSnapshot | null = null;
  private scrollColumn = 0;
  private scrollRow = 0;
  private overviewProgress = 0;
  private presentationMode: NiriPresentationMode = "normal";
  private targetOverviewProgress = 0;
  private targetScrollColumn = 0;
  private targetScrollRow = 0;
  private lastViewport: Rect = { height: defaultViewportHeight, width: 1200, x: 0, y: 0 };

  constructor(
    private readonly engine: NiriLikeLayoutEngine,
    private readonly scene: NiriWorkspaceScene,
    initialFocusedPaneId?: PaneId,
    private readonly options: NiriLayoutStoreOptions = {},
  ) {
    if (initialFocusedPaneId) {
      this.setFocusedPane(initialFocusedPaneId);
      this.snapScrollToTarget();
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
    const blend = Math.min(1, deltaMs / scrollAnimationTimeConstantMs);
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

  getSnapshot(): NiriLayoutSnapshot {
    if (!this.snapshot) {
      this.snapshot = {
        focusedColumnIndex: this.focusedColumnIndex,
        focusedPaneId: this.focusedPaneId(),
        focusedRowIndex: this.focusedRowIndex,
        maximizedPaneId: this.maximizedPaneId,
        overviewProgress: this.overviewProgress,
        presentationMode: this.presentationMode,
        scrollColumn: this.scrollColumn,
        scrollRow: this.scrollRow,
        targetScrollColumn: this.targetScrollColumn,
        targetScrollRow: this.targetScrollRow,
      };
    }
    return this.snapshot;
  }

  private createSnapshot(): NiriLayoutSnapshot {
    return {
      focusedColumnIndex: this.focusedColumnIndex,
      focusedPaneId: this.focusedPaneId(),
      focusedRowIndex: this.focusedRowIndex,
      maximizedPaneId: this.maximizedPaneId,
      overviewProgress: this.overviewProgress,
      presentationMode: this.presentationMode,
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
    const visualTargetPaneId = this.visualTargetPaneId(direction, viewport);
    if (visualTargetPaneId) {
      this.setFocusedPane(visualTargetPaneId);
      this.notify();
      return;
    }
    if (!this.moveFallbackFocus(direction)) {
      return;
    }
    this.notify();
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
      throw new Error(`niri pane limit reached for ${limitState.surfaceKind}`);
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
    return this.openPane({
      subtitle: "choose a pane type",
      surfaceKind: "empty-frame",
      title: "New frame",
      tone: "slate",
    });
  }

  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId {
    const limitState = this.paneLimitState(request);
    if (!limitState.allowed) {
      throw new Error(`niri pane limit reached for ${limitState.surfaceKind}`);
    }
    const configuredPaneId = this.engine.configurePane(paneId, request);
    this.setFocusedPane(configuredPaneId);
    this.notify();
    return configuredPaneId;
  }

  configureFocusedPane(request: OpenPaneRequest): PaneId {
    return this.configurePane(this.focusedPaneId(), request);
  }

  canOpenPane(request: OpenPaneRequest): boolean {
    return this.paneLimitState(request).allowed;
  }

  paneLimitState(request: OpenPaneRequest): NiriPaneLimitState {
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
    this.ensureFocusedColumnVisible(viewport);
    this.ensureFocusedRowVisible(viewport);
  }

  ensureFocusedRowVisible(viewport: Rect): void {
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
      throw new Error("niri layout has no focused column");
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

  resizePaneColumn(paneId: PaneId, width: ColumnWidthSpec): ColumnId | null {
    const columnId = this.toScene().paneById.get(paneId)?.columnId;
    if (!columnId) {
      return null;
    }
    this.engine.resizeColumn(columnId, width);
    this.notify();
    return columnId;
  }

  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean {
    if (!this.engine.reorderPaneBefore(sourcePaneId, targetPaneId)) {
      return false;
    }
    this.setFocusedPane(sourcePaneId);
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

  toScene(): NiriWorkspaceScene {
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
    this.notify();
  }

  subscribe(listener: LayoutStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
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
    this.targetScrollColumn = this.targetScrollForFocusedColumn();
    this.targetScrollRow = this.targetScrollForFocusedRow();
    if (Math.abs(this.scrollColumn - this.targetScrollColumn) < 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
    if (Math.abs(this.scrollRow - this.targetScrollRow) < 0.001) {
      this.scrollRow = this.targetScrollRow;
    }
  }

  private targetScrollForFocusedColumn(): number {
    return Math.max(0, this.engine.paneLocation(this.focusedPaneId())?.planeColumnIndex ?? 0);
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

function isHorizontalFocusDirection(direction: "up" | "down" | "left" | "right"): boolean {
  return direction === "left" || direction === "right";
}
