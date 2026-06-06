import type {
  ColumnId,
  LayoutEngine,
  LayoutFrameInput,
  NiriColumn,
  NiriPane,
  NiriWorkspaceScene,
  OpenPaneRequest,
  PaneId,
  PaneRenderItem,
  SizeSpec,
} from "./types";

type PaneDirection = "up" | "down" | "left" | "right";
type PaneLocation = { columnIndex: number; rowIndex: number };

export class NiriLikeLayoutEngine implements LayoutEngine {
  private columns: NiriColumn[];
  private paneById: Map<PaneId, NiriPane>;
  private nextPaneSequence: number;

  constructor(private readonly scene: NiriWorkspaceScene) {
    this.columns = scene.columns.map((column) => ({
      ...column,
      paneIds: [...column.paneIds],
    }));
    this.paneById = new Map(scene.paneById);
    this.nextPaneSequence = scene.totalPanes;
  }

  closePane(paneId: PaneId): void {
    this.paneById.delete(paneId);
    this.columns = this.columns
      .map((column) => ({
        ...column,
        paneIds: column.paneIds.filter((candidateId) => candidateId !== paneId),
      }))
      .filter((column) => column.paneIds.length > 0)
      .map((column, index) => ({ ...column, index }));
  }

  columnCount(): number {
    return this.columns.length;
  }

  focusedPaneAt(columnIndex: number, rowIndex: number): PaneId {
    return this.requirePaneAt(columnIndex, rowIndex).paneId;
  }

  moveFocus(direction: PaneDirection): void {
    switch (direction) {
      case "down":
      case "left":
      case "right":
      case "up":
        return;
      default:
        assertNever(direction);
    }
  }

  movePane(paneId: PaneId, direction: PaneDirection): void {
    const source = this.locationForPane(paneId);
    if (!source) {
      return;
    }
    if (isVerticalDirection(direction)) {
      this.movePaneWithinColumn(paneId, source, direction);
      return;
    }
    this.movePaneToAdjacentColumn(paneId, source, direction);
  }

  openPane(request: OpenPaneRequest): PaneId {
    const column = request.columnId
      ? this.columns.find((candidate) => candidate.columnId === request.columnId)
      : this.columns.at(-1);
    const targetColumn = column ?? this.appendColumn();
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    const pane: NiriPane = {
      columnId: targetColumn.columnId,
      heat: (sequence * 37) % 100,
      paneId: `niri_pane_${sequence}`,
      sequence,
      subtitle: "fake prototype surface",
      surfaceId: `niri_surface_${sequence}`,
      surfaceKind: "fake-dom",
      title: request.title ?? `Pane ${String(sequence + 1).padStart(3, "0")}`,
      tone: "slate",
      weight: 1,
    };
    this.paneById.set(pane.paneId, pane);
    targetColumn.paneIds.push(pane.paneId);
    return pane.paneId;
  }

  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    if (this.columns.length === 0 || input.viewport.width <= 0 || input.viewport.height <= 0) {
      return;
    }

    const visibleColumnCount = Math.min(this.scene.visibleColumnCount, this.columns.length);
    const maxStartColumn = Math.max(0, this.columns.length - visibleColumnCount);
    const startColumn = clamp(Math.round(input.scrollColumn), 0, maxStartColumn);
    const columnWidth = this.columnWidth(input.viewport.width, visibleColumnCount);
    const columnStep = columnWidth + this.scene.columnGap;
    const availableHeight = Math.max(1, input.viewport.height - this.scene.padding * 2 - 28);

    for (let offset = 0; offset < visibleColumnCount; offset += 1) {
      const column = this.columns[startColumn + offset];
      if (!column) {
        continue;
      }
      const x = this.scene.padding + (column.index - input.scrollColumn) * columnStep;
      this.pushColumnItems({
        availableHeight,
        column,
        columnWidth,
        focusedPaneId: input.focusedPaneId,
        moving: input.movementPhase === "moving",
        push,
        x,
      });
    }
  }

  resizeColumn(columnId: ColumnId, width: SizeSpec): void {
    const column = this.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      return;
    }
    column.widthWeight = width.unit === "weight" ? Math.max(0.1, width.value) : 1;
  }

  resizePane(paneId: PaneId, heightWeight: number): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      return;
    }
    this.paneById.set(paneId, {
      ...pane,
      weight: Math.max(0.1, heightWeight),
    });
  }

  splitPane(paneId: PaneId, direction: PaneDirection): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane({});
    }
    if (isHorizontalDirection(direction)) {
      const columnId = this.insertAdjacentColumn(source.columnIndex, direction).columnId;
      return this.openPane({ columnId });
    }
    const createdPaneId = this.openPane({ columnId: this.columns[source.columnIndex]?.columnId });
    this.insertPaneBesideSource(createdPaneId, source, direction);
    return createdPaneId;
  }

  private appendColumn(): NiriColumn {
    const column: NiriColumn = {
      columnId: `niri_column_${this.columns.length}`,
      index: this.columns.length,
      paneIds: [],
      widthWeight: 1,
    };
    this.columns.push(column);
    return column;
  }

  private columnWidth(viewportWidth: number, visibleColumnCount: number): number {
    const availableWidth =
      viewportWidth - this.scene.padding * 2 - this.scene.columnGap * (visibleColumnCount - 1);
    return Math.max(96, Math.floor(availableWidth / visibleColumnCount));
  }

  private insertAdjacentColumn(columnIndex: number, direction: "left" | "right"): NiriColumn {
    const index = direction === "left" ? columnIndex : columnIndex + 1;
    const column: NiriColumn = {
      columnId: `niri_column_${this.columns.length}`,
      index,
      paneIds: [],
      widthWeight: 1,
    };
    this.columns.splice(index, 0, column);
    this.columns = this.columns.map((candidate, nextIndex) => ({
      ...candidate,
      index: nextIndex,
    }));
    return this.columns[index] ?? column;
  }

  private insertPaneBesideSource(
    createdPaneId: PaneId,
    source: PaneLocation,
    direction: "up" | "down",
  ): void {
    const paneIds = this.columns[source.columnIndex]?.paneIds;
    if (!paneIds) {
      return;
    }
    const createdIndex = paneIds.indexOf(createdPaneId);
    if (createdIndex >= 0) {
      paneIds.splice(createdIndex, 1);
    }
    paneIds.splice(source.rowIndex + (direction === "down" ? 1 : 0), 0, createdPaneId);
  }

  private locationForPane(paneId: PaneId): PaneLocation | null {
    for (const column of this.columns) {
      const rowIndex = column.paneIds.indexOf(paneId);
      if (rowIndex >= 0) {
        return { columnIndex: column.index, rowIndex };
      }
    }
    return null;
  }

  private movePaneToAdjacentColumn(
    paneId: PaneId,
    source: PaneLocation,
    direction: "left" | "right",
  ): void {
    const offset = direction === "left" ? -1 : 1;
    const targetColumn = clamp(source.columnIndex + offset, 0, this.columns.length - 1);
    if (targetColumn === source.columnIndex) {
      return;
    }
    this.columns[source.columnIndex]?.paneIds.splice(source.rowIndex, 1);
    this.columns[targetColumn]?.paneIds.push(paneId);
  }

  private movePaneWithinColumn(
    paneId: PaneId,
    source: PaneLocation,
    direction: "up" | "down",
  ): void {
    const paneIds = this.columns[source.columnIndex]?.paneIds;
    if (!paneIds) {
      return;
    }
    const offset = direction === "up" ? -1 : 1;
    const targetRow = clamp(source.rowIndex + offset, 0, paneIds.length - 1);
    paneIds.splice(source.rowIndex, 1);
    paneIds.splice(targetRow, 0, paneId);
  }

  private pushColumnItems({
    availableHeight,
    column,
    columnWidth,
    focusedPaneId,
    moving,
    push,
    x,
  }: {
    availableHeight: number;
    column: NiriColumn;
    columnWidth: number;
    focusedPaneId: PaneId;
    moving: boolean;
    push: (item: PaneRenderItem) => void;
    x: number;
  }) {
    const panes = column.paneIds
      .map((paneId) => this.paneById.get(paneId))
      .filter((pane): pane is NiriPane => pane !== undefined);
    const totalWeight = panes.reduce((total, pane) => total + pane.weight, 0);
    const totalGap = this.scene.rowGap * Math.max(0, panes.length - 1);
    let y = this.scene.padding + 28;

    for (const pane of panes) {
      const height = Math.max(42, ((availableHeight - totalGap) * pane.weight) / totalWeight);
      const focused = pane.paneId === focusedPaneId;
      push({
        focused,
        height,
        moving,
        opacity: 1,
        paneId: pane.paneId,
        resizing: false,
        runtimeState: "live",
        surfaceId: pane.surfaceId,
        surfaceKind: pane.surfaceKind,
        visible: true,
        width: columnWidth,
        x,
        y,
        z: focused ? 2 : 1,
      });
      y += height + this.scene.rowGap;
    }
  }

  private requirePaneAt(columnIndex: number, rowIndex: number): NiriPane {
    const column = this.columns[clamp(columnIndex, 0, this.columns.length - 1)];
    if (!column) {
      throw new Error("niri layout has no columns");
    }
    const paneId = column.paneIds[clamp(rowIndex, 0, column.paneIds.length - 1)];
    const pane = paneId ? this.paneById.get(paneId) : undefined;
    if (!pane) {
      throw new Error(`niri layout column ${column.columnId} has no pane at row ${rowIndex}`);
    }
    return pane;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled niri pane direction: ${value}`);
}

function isHorizontalDirection(direction: PaneDirection): direction is "left" | "right" {
  return direction === "left" || direction === "right";
}

function isVerticalDirection(direction: PaneDirection): direction is "up" | "down" {
  return direction === "up" || direction === "down";
}
