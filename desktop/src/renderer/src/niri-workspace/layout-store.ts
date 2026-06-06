import type { NiriLikeLayoutEngine } from "./layout-engine";
import type { ColumnId, NiriWorkspaceScene, PaneId } from "./types";

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
  private scrollColumn = 0;
  private targetScrollColumn = 0;

  constructor(
    private readonly engine: NiriLikeLayoutEngine,
    private readonly scene: NiriWorkspaceScene,
  ) {}

  advanceFrame(deltaMs: number): "idle" | "moving" {
    const distance = this.targetScrollColumn - this.scrollColumn;
    if (Math.abs(distance) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
      return "idle";
    }
    const blend = Math.min(1, deltaMs / 72);
    this.scrollColumn += distance * blend;
    if (Math.abs(this.targetScrollColumn - this.scrollColumn) <= 0.001) {
      this.scrollColumn = this.targetScrollColumn;
    }
    return "moving";
  }

  focusedPaneId(): PaneId {
    return this.engine.focusedPaneAt(this.focusedColumnIndex, this.focusedRowIndex);
  }

  visibleColumnCount(): number {
    return this.scene.visibleColumnCount;
  }

  getSnapshot(): NiriLayoutSnapshot {
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
      this.focusedRowIndex = Math.min(this.scene.panesPerColumn - 1, this.focusedRowIndex + 1);
    } else {
      const offset = direction === "left" ? -1 : 1;
      const maxColumn = Math.max(0, this.engine.columnCount() - 1);
      this.focusedColumnIndex = Math.min(maxColumn, Math.max(0, this.focusedColumnIndex + offset));
      this.targetScrollColumn = this.targetScrollForFocusedColumn();
    }
    this.engine.moveFocus(direction);
    this.notify();
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

  subscribe(listener: LayoutStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private targetScrollForFocusedColumn(): number {
    const maxStartColumn = Math.max(0, this.engine.columnCount() - this.scene.visibleColumnCount);
    const leadColumns = Math.floor(this.scene.visibleColumnCount / 2);
    return Math.min(maxStartColumn, Math.max(0, this.focusedColumnIndex - leadColumns));
  }
}
