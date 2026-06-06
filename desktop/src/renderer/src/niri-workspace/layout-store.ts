import type { NiriLikeLayoutEngine } from "./layout-engine";
import type {
  ColumnId,
  ColumnWidthSpec,
  NiriPresentationMode,
  NiriWorkspaceScene,
  OpenPaneRequest,
  PaneId,
  Rect,
  SurfaceKind,
} from "./types";

export interface NiriLayoutSnapshot {
  focusedColumnIndex: number;
  focusedPaneId: PaneId;
  focusedRowIndex: number;
  maximizedPaneId: PaneId | null;
  presentationMode: NiriPresentationMode;
  scrollColumn: number;
  scrollRow: number;
  targetScrollColumn: number;
  targetScrollRow: number;
}

type LayoutStoreListener = (snapshot: NiriLayoutSnapshot) => void;
const scrollAnimationTimeConstantMs = 140;

export class NiriLayoutStore {
  private focusedColumnIndex = 0;
  private focusedRowIndex = 0;
  private listeners = new Set<LayoutStoreListener>();
  private maximizedPaneId: PaneId | null = null;
  private snapshot: NiriLayoutSnapshot | null = null;
  private scrollColumn = 0;
  private scrollRow = 0;
  private presentationMode: NiriPresentationMode = "normal";
  private targetScrollColumn = 0;
  private targetScrollRow = 0;

  constructor(
    private readonly engine: NiriLikeLayoutEngine,
    private readonly scene: NiriWorkspaceScene,
    initialFocusedPaneId?: PaneId,
  ) {
    if (initialFocusedPaneId) {
      this.setFocusedPane(initialFocusedPaneId);
    }
  }

  advanceFrame(deltaMs: number): "idle" | "moving" {
    const columnDistance = this.targetScrollColumn - this.scrollColumn;
    const rowDistance = this.targetScrollRow - this.scrollRow;
    if (Math.abs(columnDistance) <= 0.001 && Math.abs(rowDistance) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
      this.scrollRow = this.targetScrollRow;
      this.snapshot = null;
      return "idle";
    }
    const blend = Math.min(1, deltaMs / scrollAnimationTimeConstantMs);
    this.scrollColumn += columnDistance * blend;
    this.scrollRow += rowDistance * blend;
    if (Math.abs(this.targetScrollColumn - this.scrollColumn) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
    if (Math.abs(this.targetScrollRow - this.scrollRow) <= 0.001) {
      this.scrollRow = this.targetScrollRow;
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
      presentationMode: this.presentationMode,
      scrollColumn: this.scrollColumn,
      scrollRow: this.scrollRow,
      targetScrollColumn: this.targetScrollColumn,
      targetScrollRow: this.targetScrollRow,
    };
  }

  moveFocus(direction: "up" | "down" | "left" | "right", viewport?: Rect): void {
    const visualTargetPaneId = viewport
      ? this.engine.paneInVisualDirection(this.focusedPaneId(), direction, viewport)
      : null;
    if (visualTargetPaneId) {
      this.setFocusedPane(visualTargetPaneId);
      this.engine.moveFocus(direction);
      this.notify();
      return;
    }
    if (direction === "up") {
      this.focusedRowIndex = Math.max(0, this.focusedRowIndex - 1);
      this.targetScrollRow = this.targetScrollForFocusedRow();
    } else if (direction === "down") {
      this.focusedRowIndex = Math.min(this.currentColumnRowCount() - 1, this.focusedRowIndex + 1);
      this.targetScrollRow = this.targetScrollForFocusedRow();
    } else {
      const offset = direction === "left" ? -1 : 1;
      const maxColumn = Math.max(0, this.engine.columnCount() - 1);
      this.focusedColumnIndex = Math.min(maxColumn, Math.max(0, this.focusedColumnIndex + offset));
      this.focusedRowIndex = Math.min(this.currentColumnRowCount() - 1, this.focusedRowIndex);
      this.targetScrollColumn = this.targetScrollForFocusedColumn();
      this.targetScrollRow = this.targetScrollForFocusedRow();
    }
    this.engine.moveFocus(direction);
    this.notify();
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

  splitFocusedPane(direction: "up" | "down" | "left" | "right"): PaneId {
    const paneId = this.engine.splitPane(this.focusedPaneId(), direction);
    this.setFocusedPane(paneId);
    this.notify();
    return paneId;
  }

  ensureFocusedColumnVisible(viewport: Rect): void {
    const nextScrollColumn = this.engine.scrollColumnForFocusedColumnVisibility(
      this.focusedColumnIndex,
      this.targetScrollColumn,
      viewport.width,
    );
    if (Math.abs(nextScrollColumn - this.targetScrollColumn) <= 0.001) {
      return;
    }
    this.targetScrollColumn = nextScrollColumn;
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
    const maxStartColumn = Math.max(0, this.engine.columnCount() - 1);
    return Math.min(maxStartColumn, Math.max(0, this.focusedColumnIndex));
  }

  private targetScrollForFocusedRow(): number {
    return Math.max(0, this.focusedRowIndex);
  }

  private unlockFocusedColumn(viewport: Rect): void {
    this.engine.unlockColumnWidth(this.focusedColumnId(), viewport.width);
    this.notify();
  }
}
