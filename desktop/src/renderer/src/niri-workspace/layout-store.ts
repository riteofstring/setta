import type { NiriLikeLayoutEngine } from "./layout-engine";
import type { ColumnId, NiriWorkspaceScene, OpenPaneRequest, PaneId } from "./types";

export interface NiriLayoutSnapshot {
  focusedColumnIndex: number;
  focusedPaneId: PaneId;
  focusedRowIndex: number;
  scrollColumn: number;
  targetScrollColumn: number;
}

type LayoutStoreListener = (snapshot: NiriLayoutSnapshot) => void;

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
    const blend = Math.min(1, deltaMs / 72);
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
    this.engine.closePane(closedPaneId);
    const nextPaneId = this.engine.firstPaneId();
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
    const paneId = this.engine.openPane({
      ...request,
      columnId: request.columnId ?? this.currentColumnId(),
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

  resizeColumn(columnId: ColumnId, value: number): void {
    this.engine.resizeColumn(columnId, { unit: "weight", value });
    this.notify();
  }

  scrollToColumn(columnIndex: number): void {
    const maxColumn = Math.max(0, this.engine.columnCount() - this.scene.visibleColumnCount);
    this.targetScrollColumn = Math.min(maxColumn, Math.max(0, columnIndex));
    this.notify();
  }

  toScene(): NiriWorkspaceScene {
    return this.engine.toScene(this.scene.id);
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
    const maxStartColumn = Math.max(0, this.engine.columnCount() - this.scene.visibleColumnCount);
    const leadColumns = Math.floor(this.scene.visibleColumnCount / 2);
    return Math.min(maxStartColumn, Math.max(0, this.focusedColumnIndex - leadColumns));
  }
}
