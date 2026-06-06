import type { NiriLikeLayoutEngine } from "./layout-engine";
import type {
  ColumnId,
  ColumnWidthSpec,
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
  scrollColumn: number;
  targetScrollColumn: number;
}

type LayoutStoreListener = (snapshot: NiriLayoutSnapshot) => void;
const scrollAnimationTimeConstantMs = 140;

export class NiriLayoutStore {
  private focusedColumnIndex = 0;
  private focusedRowIndex = 0;
  private listeners = new Set<LayoutStoreListener>();
  private snapshot: NiriLayoutSnapshot | null = null;
  private scrollColumn = 0;
  private targetScrollColumn = 0;

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
    const distance = this.targetScrollColumn - this.scrollColumn;
    if (Math.abs(distance) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
      this.snapshot = null;
      return "idle";
    }
    const blend = Math.min(1, deltaMs / scrollAnimationTimeConstantMs);
    this.scrollColumn += distance * blend;
    if (Math.abs(this.targetScrollColumn - this.scrollColumn) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
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
        scrollColumn: this.scrollColumn,
        targetScrollColumn: this.targetScrollColumn,
      };
    }
    return this.snapshot;
  }

  private createSnapshot(): NiriLayoutSnapshot {
    return {
      focusedColumnIndex: this.focusedColumnIndex,
      focusedPaneId: this.focusedPaneId(),
      focusedRowIndex: this.focusedRowIndex,
      scrollColumn: this.scrollColumn,
      targetScrollColumn: this.targetScrollColumn,
    };
  }

  moveFocus(direction: "up" | "down" | "left" | "right"): void {
    if (direction === "up") {
      this.focusedRowIndex = Math.max(0, this.focusedRowIndex - 1);
    } else if (direction === "down") {
      this.focusedRowIndex = Math.min(this.currentColumnRowCount() - 1, this.focusedRowIndex + 1);
    } else {
      const offset = direction === "left" ? -1 : 1;
      const maxColumn = Math.max(0, this.engine.columnCount() - 1);
      this.focusedColumnIndex = Math.min(maxColumn, Math.max(0, this.focusedColumnIndex + offset));
      this.focusedRowIndex = Math.min(this.currentColumnRowCount() - 1, this.focusedRowIndex);
      this.targetScrollColumn = this.targetScrollForFocusedColumn();
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

  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void {
    this.engine.resizeColumn(columnId, width);
    this.notify();
  }

  scrollToColumn(columnIndex: number): void {
    const maxColumn = Math.max(0, this.engine.columnCount() - 1);
    this.targetScrollColumn = Math.min(maxColumn, Math.max(0, columnIndex));
    this.notify();
  }

  snapScrollToTarget(): void {
    this.scrollColumn = this.targetScrollColumn;
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
    if (Math.abs(this.scrollColumn - this.targetScrollColumn) < 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
  }

  private targetScrollForFocusedColumn(): number {
    const maxStartColumn = Math.max(0, this.engine.columnCount() - 1);
    const trailingColumns = Math.max(0, this.scene.visibleColumnCount - 1);
    return Math.min(maxStartColumn, Math.max(0, this.focusedColumnIndex - trailingColumns));
  }

  private unlockFocusedColumn(viewport: Rect): void {
    this.engine.unlockColumnWidth(this.focusedColumnId(), viewport.width);
    this.notify();
  }
}
