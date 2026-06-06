import type {
  ColumnId,
  ColumnWidthSpec,
  LayoutEngine,
  LayoutFrameInput,
  NiriColumn,
  NiriPane,
  NiriWorkspaceScene,
  OpenPaneRequest,
  PaneId,
  PaneRenderItem,
} from "./types";
import {
  columnSlotIndex,
  compareColumnsByPlaneAndSlot,
  nextSlotIndexForPlane,
  normalizeColumnSlots,
  planeHasSlot,
  shiftPlaneSlotsAtOrAfter,
  slotIndexForDenseInsertion,
  slotOffsetsForColumns,
} from "./column-slots";
import { activeMaximizedPaneIdFor, paneFrame } from "./pane-frame";

type PaneDirection = "up" | "down" | "left" | "right";
type PaneLocation = {
  columnIndex: number;
  planeColumnIndex: number;
  planeIndex: number;
  rowIndex: number;
};
type PaneVisualFrame = { centerY: number; paneId: PaneId; top: number };
type ColumnGeometry = { offsets: number[]; widths: number[] };

const columnWidthPresets = [1 / 3, 0.5, 2 / 3, 1] as const;
const minimumColumnWidth = 96;
const maximumOverviewScale = 0.42;
const minimumOverviewScale = 0.12;
const planeGap = 28;
export class NiriLikeLayoutEngine implements LayoutEngine {
  private columns: NiriColumn[];
  private nextColumnSequence: number;
  private paneById: Map<PaneId, NiriPane>;
  private nextPaneSequence: number;

  constructor(private readonly scene: NiriWorkspaceScene) {
    this.columns = normalizeColumnSlots(
      scene.columns.map((column) => ({
        ...column,
        idealWidthSpec: { ...column.idealWidthSpec },
        paneIds: [...column.paneIds],
        planeIndex: column.planeIndex,
        widthSpec: { ...column.widthSpec },
      })),
    );
    this.paneById = new Map(scene.paneById);
    this.nextColumnSequence = nextNumericSuffix(
      this.columns,
      "niri_column_",
      (column) => column.columnId,
    );
    this.nextPaneSequence = Math.max(
      scene.totalPanes,
      nextNumericSuffix(scene.panes, "niri_pane_", (pane) => pane.paneId),
    );
  }

  closePane(paneId: PaneId): void {
    this.paneById.delete(paneId);
    this.columns = this.columns
      .map((column) => ({
        ...column,
        paneIds: column.paneIds.filter((candidateId) => candidateId !== paneId),
      }))
      .filter((column) => column.paneIds.length > 0);
    this.reindexColumns();
  }

  columnCount(): number {
    return this.columns.length;
  }

  firstPaneId(): PaneId | null {
    return this.columns[0]?.paneIds[0] ?? null;
  }

  focusedPaneAt(columnIndex: number, rowIndex: number): PaneId {
    return this.requirePaneAt(columnIndex, rowIndex).paneId;
  }

  paneCount(): number {
    return this.paneById.size;
  }

  paneLocation(paneId: PaneId): PaneLocation | null {
    return this.locationForPane(paneId);
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
    const targetColumn = request.columnId
      ? this.requireColumn(request.columnId)
      : this.insertColumnAfter(request.adjacentToColumnId, request.widthSpec);
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    const pane: NiriPane = {
      columnId: targetColumn.columnId,
      heat: (sequence * 37) % 100,
      paneId: `niri_pane_${sequence}`,
      sequence,
      subtitle: request.subtitle ?? "workspace surface",
      surfaceId: `niri_surface_${sequence}`,
      surfaceKind: request.surfaceKind ?? "fake-dom",
      title: request.title ?? `Pane ${String(sequence + 1).padStart(3, "0")}`,
      tone: request.tone ?? "slate",
      weight: request.weight ?? 1,
    };
    this.paneById.set(pane.paneId, pane);
    targetColumn.paneIds.push(pane.paneId);
    return pane.paneId;
  }

  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown niri pane ${paneId}`);
    }
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    this.paneById.set(paneId, {
      ...pane,
      heat: (sequence * 37) % 100,
      subtitle: request.subtitle ?? pane.subtitle,
      surfaceId: `niri_surface_${sequence}`,
      surfaceKind: request.surfaceKind ?? pane.surfaceKind,
      title: request.title ?? pane.title,
      tone: request.tone ?? pane.tone,
      weight: request.weight ?? pane.weight,
    });
    return paneId;
  }

  paneInVisualDirection(
    paneId: PaneId,
    direction: PaneDirection,
    viewport: LayoutFrameInput["viewport"],
  ): PaneId | null {
    const source = this.locationForPane(paneId);
    if (!source) {
      return null;
    }
    const availableHeight = this.availablePaneHeight(viewport.height);
    if (isVerticalDirection(direction)) {
      return this.paneInVerticalVisualDirection(source, direction, viewport, availableHeight);
    }
    return this.paneInHorizontalVisualDirection(source, direction, availableHeight);
  }

  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    if (this.columns.length === 0 || input.viewport.width <= 0 || input.viewport.height <= 0) {
      return;
    }

    if (input.presentationMode === "overview") {
      this.renderOverviewFrame(input, push);
      return;
    }

    this.renderNormalFrame(input, push);
  }

  private renderNormalFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    const geometry = this.columnGeometry(input.viewport.width);
    const focusedLocation = this.locationForPane(input.focusedPaneId);
    const focusedPlaneIndex = focusedLocation?.planeIndex ?? this.planeIndexes()[0] ?? 0;
    const scrollColumn = this.constrainScrollColumnToViewport(
      input.scrollColumn,
      input.viewport.width,
      focusedPlaneIndex,
      geometry,
    );
    const availableHeight = this.availablePaneHeight(input.viewport.height);
    const verticalOffset = input.scrollRow;
    const activeMaximizedPaneId = activeMaximizedPaneIdFor(input);
    const planeOffsets = this.planeTopOffsets(input.viewport.height);

    for (const columnIndex of this.renderedColumnIndexes(
      input.viewport,
      scrollColumn,
      verticalOffset,
    )) {
      const column = this.columns[columnIndex];
      if (!column) {
        continue;
      }
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      const x =
        this.scene.padding +
        (geometry.offsets[column.index] ?? 0) -
        this.scrollOffsetForPlane(scrollColumn, geometry, column.planeIndex);
      const planeTop = planeOffsets.get(column.planeIndex) ?? 0;
      this.pushColumnItems({
        availableHeight,
        activeMaximizedPaneId,
        column,
        columnWidth,
        maximizedViewport: input.viewport,
        focusedPaneId: input.focusedPaneId,
        moving: input.movementPhase === "moving",
        presentationMode: input.presentationMode,
        push,
        scale: 1,
        x,
        yOffset: planeTop - verticalOffset,
      });
    }
  }

  lockColumnWidth(columnId: ColumnId, viewportWidth: number): void {
    const column = this.requireColumn(columnId);
    const resolvedWidth = this.resolvedColumnWidth(column.columnId, viewportWidth);
    const previousProportion =
      column.widthSpec.unit === "proportion"
        ? column.widthSpec.value
        : column.previousProportionWidth;
    column.previousProportionWidth = previousProportion;
    column.widthSpec = { unit: "px", value: Math.max(minimumColumnWidth, resolvedWidth) };
  }

  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void {
    const column = this.requireColumn(columnId);
    column.widthSpec = normalizedColumnWidthSpec(width);
    if (column.widthSpec.unit === "proportion") {
      column.previousProportionWidth = column.widthSpec.value;
    }
  }

  resetColumnWidth(columnId: ColumnId): void {
    const column = this.requireColumn(columnId);
    column.widthSpec = normalizedColumnWidthSpec(column.idealWidthSpec);
    if (column.widthSpec.unit === "proportion") {
      column.previousProportionWidth = column.widthSpec.value;
    }
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
      const columnId = this.insertAdjacentColumn(source, direction).columnId;
      return this.openPane({ columnId });
    }
    const createdPaneId = this.openPane({ columnId: this.columns[source.columnIndex]?.columnId });
    this.insertPaneBesideSource(createdPaneId, source, direction);
    return createdPaneId;
  }

  splitPaneToPlane(paneId: PaneId, direction: "up" | "down"): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane({});
    }
    const targetPlaneIndex = source.planeIndex + (direction === "up" ? -1 : 1);
    const sourceColumn = this.columns[source.columnIndex];
    const columnId = this.insertColumnInPlaneSlot(
      targetPlaneIndex,
      sourceColumn ? columnSlotIndex(sourceColumn) : source.planeColumnIndex,
    ).columnId;
    return this.openPane({ columnId });
  }

  unlockColumnWidth(columnId: ColumnId, viewportWidth: number): void {
    const column = this.requireColumn(columnId);
    if (column.widthSpec.unit === "proportion") {
      return;
    }
    const unlockedProportion =
      column.previousProportionWidth ??
      nearestColumnWidthPreset(column.widthSpec.value / this.availableWidth(viewportWidth));
    column.widthSpec = {
      unit: "proportion",
      value: nearestColumnWidthPreset(unlockedProportion),
    };
    column.previousProportionWidth = column.widthSpec.value;
  }

  resolvedColumnWidth(columnId: ColumnId, viewportWidth: number): number {
    return this.resolveColumnWidth(this.requireColumn(columnId), viewportWidth);
  }

  verticalScrollOffsetForPane(paneId: PaneId, viewportHeight: number): number {
    const location = this.locationForPane(paneId);
    if (!location) {
      return 0;
    }
    const focusedColumn = this.columns[location.columnIndex];
    if (!focusedColumn) {
      return 0;
    }
    const availableHeight = this.availablePaneHeight(viewportHeight);
    const planeOffset = this.planeTopOffsets(viewportHeight).get(location.planeIndex) ?? 0;
    return (
      planeOffset +
      this.scrollOffsetForColumn(
        location.rowIndex,
        this.rowTopOffsets(focusedColumn, availableHeight),
      )
    );
  }

  scrollColumnForFocusedColumnVisibility(
    focusedColumnIndex: number,
    currentScrollColumn: number,
    viewportWidth: number,
  ): number {
    void currentScrollColumn;
    const focusedColumn = this.columns[focusedColumnIndex];
    const focusedPlaneIndex = focusedColumn?.planeIndex ?? 0;
    const focusedPlaneColumnIndex = focusedColumn
      ? this.planeColumnIndex(focusedColumn)
      : focusedColumnIndex;
    return this.constrainScrollColumnToViewport(
      focusedPlaneColumnIndex,
      viewportWidth,
      focusedPlaneIndex,
    );
  }

  totalColumnOverflowWidth(viewportWidth: number): number {
    const geometry = this.columnGeometry(viewportWidth);
    return this.scene.padding * 2 + this.maxUnscaledPlaneWidth(geometry);
  }

  toScene(id: string = this.scene.id): NiriWorkspaceScene {
    const columns = this.columns.map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
      planeIndex: column.planeIndex,
      slotIndex: columnSlotIndex(column),
      widthSpec: { ...column.widthSpec },
    }));
    const panes = [...this.paneById.values()].sort((left, right) => left.sequence - right.sequence);
    const widestPlaneColumnCount = Math.max(
      1,
      ...this.planeIndexes().map((planeIndex) => this.columnsInPlane(planeIndex).length),
    );
    return {
      ...this.scene,
      columns,
      id,
      paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
      panes,
      panesPerColumn: Math.max(1, ...columns.map((column) => column.paneIds.length)),
      totalPanes: panes.length,
      visibleColumnCount: Math.min(this.scene.visibleColumnCount, widestPlaneColumnCount),
    };
  }

  private appendColumn(
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
    planeIndex = 0,
  ): NiriColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const column: NiriColumn = {
      columnId: this.nextColumnId(),
      idealWidthSpec: { ...normalizedWidthSpec },
      index: this.columns.length,
      paneIds: [],
      planeIndex,
      previousProportionWidth:
        normalizedWidthSpec.unit === "proportion" ? normalizedWidthSpec.value : undefined,
      slotIndex: nextSlotIndexForPlane(this.columnsInPlane(planeIndex)),
      widthSpec: { ...normalizedWidthSpec },
    };
    this.columns.push(column);
    this.reindexColumns();
    return column;
  }

  private availablePaneHeight(viewportHeight: number): number {
    return Math.max(1, viewportHeight - this.scene.padding * 2);
  }

  private availableWidth(viewportWidth: number): number {
    return Math.max(minimumColumnWidth, viewportWidth - this.scene.padding * 2);
  }

  private columnGeometry(viewportWidth: number): ColumnGeometry {
    const widths = this.columns.map((column) => this.resolveColumnWidth(column, viewportWidth));
    const offsets = Array.from({ length: this.columns.length }, () => 0);
    const slotOffsets = slotOffsetsForColumns({
      columnGap: this.scene.columnGap,
      columns: this.columns,
      defaultWidth: this.resolveColumnWidthSpec(this.scene.defaultColumnWidthSpec, viewportWidth),
      widths,
    });
    for (const planeIndex of this.planeIndexes()) {
      for (const column of this.columnsInPlane(planeIndex)) {
        offsets[column.index] = slotOffsets.get(columnSlotIndex(column)) ?? 0;
      }
    }
    return { offsets, widths };
  }

  private constrainScrollColumnToViewport(
    scrollColumn: number,
    viewportWidth: number,
    planeIndex: number,
    geometry = this.columnGeometry(viewportWidth),
  ): number {
    const planeOffsets = this.offsetsForPlane(planeIndex, geometry);
    const requestedScrollColumn = clamp(scrollColumn, 0, Math.max(0, planeOffsets.length - 1));
    const requestedOffset = this.scrollOffsetForColumn(requestedScrollColumn, planeOffsets);
    const maximumFilledViewportOffset = Math.max(
      0,
      this.scene.padding * 2 + this.totalUnscaledPlaneWidth(planeIndex, geometry) - viewportWidth,
    );
    if (requestedOffset <= maximumFilledViewportOffset) {
      return requestedScrollColumn;
    }
    return this.scrollColumnForOffset(maximumFilledViewportOffset, planeOffsets);
  }

  private insertAdjacentColumn(source: PaneLocation, direction: "left" | "right"): NiriColumn {
    const planeColumnIndex = source.planeColumnIndex + (direction === "left" ? 0 : 1);
    return this.insertColumnInPlane(source.planeIndex, planeColumnIndex);
  }

  private insertColumnAfter(
    adjacentToColumnId: ColumnId | undefined,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): NiriColumn {
    if (!adjacentToColumnId) {
      return this.appendColumn(widthSpec);
    }
    const adjacentColumn = this.requireColumn(adjacentToColumnId);
    return this.insertColumnInPlane(
      adjacentColumn.planeIndex,
      this.planeColumnIndex(adjacentColumn) + 1,
      widthSpec,
    );
  }

  private insertColumnInPlane(
    planeIndex: number,
    planeColumnIndex: number,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): NiriColumn {
    return this.insertColumnInPlaneSlot(
      planeIndex,
      slotIndexForDenseInsertion(this.columnsInPlane(planeIndex), planeColumnIndex),
      widthSpec,
    );
  }

  private insertColumnInPlaneSlot(
    planeIndex: number,
    slotIndex: number,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): NiriColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const normalizedSlotIndex = Math.max(0, Math.floor(slotIndex));
    if (planeHasSlot(this.columnsInPlane(planeIndex), normalizedSlotIndex)) {
      this.columns = shiftPlaneSlotsAtOrAfter(this.columns, planeIndex, normalizedSlotIndex);
    }
    const column: NiriColumn = {
      columnId: this.nextColumnId(),
      idealWidthSpec: { ...normalizedWidthSpec },
      index: this.columns.length,
      paneIds: [],
      planeIndex,
      previousProportionWidth:
        normalizedWidthSpec.unit === "proportion" ? normalizedWidthSpec.value : undefined,
      slotIndex: normalizedSlotIndex,
      widthSpec: { ...normalizedWidthSpec },
    };
    this.columns.push(column);
    this.reindexColumns();
    return this.requireColumn(column.columnId);
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
        return {
          columnIndex: column.index,
          planeColumnIndex: this.planeColumnIndex(column),
          planeIndex: column.planeIndex,
          rowIndex,
        };
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
    const planeColumns = this.columnsInPlane(source.planeIndex);
    const targetPlaneColumnIndex = clamp(
      source.planeColumnIndex + offset,
      0,
      Math.max(0, planeColumns.length - 1),
    );
    const targetColumn = planeColumns[targetPlaneColumnIndex];
    if (!targetColumn || targetColumn.index === source.columnIndex) {
      return;
    }
    this.columns[source.columnIndex]?.paneIds.splice(source.rowIndex, 1);
    targetColumn.paneIds.push(paneId);
    const pane = this.paneById.get(paneId);
    if (pane) {
      this.paneById.set(paneId, { ...pane, columnId: targetColumn.columnId });
    }
    this.removeEmptyColumns();
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

  private paneInHorizontalVisualDirection(
    source: PaneLocation,
    direction: "left" | "right",
    availableHeight: number,
  ): PaneId | null {
    const planeColumns = this.columnsInPlane(source.planeIndex);
    if (planeColumns.length <= 1) {
      return null;
    }
    const targetIndex = source.planeColumnIndex + (direction === "left" ? -1 : 1);
    const targetColumn = planeColumns[(targetIndex + planeColumns.length) % planeColumns.length];
    const sourceColumn = this.columns[source.columnIndex];
    if (!sourceColumn || !targetColumn) {
      return null;
    }
    const sourceFrame = this.columnVisualFrames(sourceColumn, availableHeight)[source.rowIndex];
    if (!sourceFrame) {
      return null;
    }
    return nearestPaneByVerticalCenter(
      this.columnVisualFrames(targetColumn, availableHeight),
      sourceFrame.centerY,
    );
  }

  private paneInVerticalVisualDirection(
    source: PaneLocation,
    direction: "up" | "down",
    viewport: LayoutFrameInput["viewport"],
    availableHeight: number,
  ): PaneId | null {
    const column = this.columns[source.columnIndex];
    if (!column) {
      return null;
    }
    const frames = this.columnVisualFrames(column, availableHeight);
    const targetRowIndex = source.rowIndex + (direction === "up" ? -1 : 1);
    if (frames[targetRowIndex]) {
      return frames[targetRowIndex].paneId;
    }
    const targetPlaneIndex = this.adjacentPlaneIndex(source.planeIndex, direction);
    if (targetPlaneIndex === null) {
      return null;
    }
    const targetColumn = this.nearestColumnInPlaneByHorizontalCenter(
      targetPlaneIndex,
      source,
      viewport.width,
    );
    if (!targetColumn) {
      return null;
    }
    const sourceFrame = frames[source.rowIndex];
    return nearestPaneByVerticalCenter(
      this.columnVisualFrames(targetColumn, availableHeight),
      sourceFrame?.centerY ?? 0,
    );
  }

  private pushColumnItems({
    availableHeight,
    activeMaximizedPaneId = null,
    column,
    columnWidth,
    focusedPaneId,
    maximizedViewport = null,
    moving,
    presentationMode,
    push,
    scale,
    x,
    yOffset = 0,
  }: {
    availableHeight: number;
    activeMaximizedPaneId?: PaneId | null;
    column: NiriColumn;
    columnWidth: number;
    focusedPaneId: PaneId;
    maximizedViewport?: LayoutFrameInput["viewport"] | null;
    moving: boolean;
    presentationMode: LayoutFrameInput["presentationMode"];
    push: (item: PaneRenderItem) => void;
    scale: number;
    x: number;
    yOffset?: number;
  }) {
    const panes = column.paneIds
      .map((paneId) => this.paneById.get(paneId))
      .filter((pane): pane is NiriPane => pane !== undefined);
    const totalWeight = panes.reduce((total, pane) => total + pane.weight, 0);
    const totalGap = this.scene.rowGap * Math.max(0, panes.length - 1);
    let y = yOffset + this.scene.padding * scale;

    for (const pane of panes) {
      const height = Math.max(42, ((availableHeight - totalGap) * pane.weight) / totalWeight);
      const focused = pane.paneId === focusedPaneId;
      const frame = paneFrame({
        activeMaximizedPaneId,
        columnWidth,
        focused,
        height,
        maximizedViewport,
        padding: this.scene.padding,
        paneId: pane.paneId,
        x,
        y,
      });
      push({
        focused,
        height: frame.height,
        maximized: frame.maximized,
        moving,
        opacity: 1,
        paneId: pane.paneId,
        presentationMode,
        resizing: false,
        runtimeState: "live",
        scale,
        surfaceId: pane.surfaceId,
        surfaceKind: pane.surfaceKind,
        visible: true,
        width: frame.width,
        x: frame.x,
        y: frame.y,
        z: frame.z,
      });
      y += (height + this.scene.rowGap) * scale;
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

  private renderOverviewFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    const geometry = this.columnGeometry(input.viewport.width);
    const unscaledWidth = this.maxUnscaledPlaneWidth(geometry);
    const unscaledHeight = this.totalUnscaledPlaneHeight(input.viewport.height);
    const scale = this.overviewScale(input.viewport, unscaledWidth, unscaledHeight);
    const xOffset = Math.max(
      this.scene.padding,
      Math.floor((input.viewport.width - unscaledWidth * scale) / 2),
    );
    const yOffset = Math.max(0, Math.floor((input.viewport.height - unscaledHeight * scale) / 2));
    const availableHeight = this.availablePaneHeight(input.viewport.height);
    const planeOffsets = this.planeTopOffsets(input.viewport.height);

    for (const column of this.columns) {
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      this.pushColumnItems({
        availableHeight,
        column,
        columnWidth,
        focusedPaneId: input.focusedPaneId,
        moving: input.movementPhase === "moving",
        presentationMode: input.presentationMode,
        push,
        scale,
        x: xOffset + (geometry.offsets[column.index] ?? 0) * scale,
        yOffset: yOffset + (planeOffsets.get(column.planeIndex) ?? 0) * scale,
      });
    }
  }

  private nextColumnId(): ColumnId {
    const columnId = `niri_column_${this.nextColumnSequence}`;
    this.nextColumnSequence += 1;
    return columnId;
  }

  private removeEmptyColumns(): void {
    this.columns = this.columns.filter((column) => column.paneIds.length > 0);
    this.reindexColumns();
  }

  private requireColumn(columnId: ColumnId): NiriColumn {
    const column = this.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      throw new Error(`unknown niri column ${columnId}`);
    }
    return column;
  }

  private adjacentPlaneIndex(planeIndex: number, direction: "up" | "down"): number | null {
    const indexes = this.planeIndexes();
    const currentIndex = indexes.indexOf(planeIndex);
    if (currentIndex < 0) {
      return null;
    }
    return indexes[currentIndex + (direction === "up" ? -1 : 1)] ?? null;
  }

  private columnsInPlane(planeIndex: number): NiriColumn[] {
    return this.columns.filter((column) => column.planeIndex === planeIndex);
  }

  private maxUnscaledPlaneWidth(geometry: ColumnGeometry): number {
    return Math.max(
      minimumColumnWidth,
      ...this.planeIndexes().map((planeIndex) =>
        this.totalUnscaledPlaneWidth(planeIndex, geometry),
      ),
    );
  }

  private nearestColumnInPlaneByHorizontalCenter(
    planeIndex: number,
    source: PaneLocation,
    viewportWidth: number,
  ): NiriColumn | null {
    const sourceColumn = this.columns[source.columnIndex];
    if (!sourceColumn) {
      return null;
    }
    const geometry = this.columnGeometry(viewportWidth);
    const sourceCenter = this.columnHorizontalCenter(sourceColumn, geometry);
    let nearestColumn: NiriColumn | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const column of this.columnsInPlane(planeIndex)) {
      const distance = Math.abs(this.columnHorizontalCenter(column, geometry) - sourceCenter);
      if (distance < nearestDistance) {
        nearestColumn = column;
        nearestDistance = distance;
      }
    }
    return nearestColumn;
  }

  private columnHorizontalCenter(column: NiriColumn, geometry: ColumnGeometry): number {
    return (
      (geometry.offsets[column.index] ?? 0) +
      (geometry.widths[column.index] ?? minimumColumnWidth) / 2
    );
  }

  private offsetsForPlane(planeIndex: number, geometry: ColumnGeometry): number[] {
    return this.columnsInPlane(planeIndex).map((column) => geometry.offsets[column.index] ?? 0);
  }

  private planeColumnIndex(column: NiriColumn): number {
    return Math.max(
      0,
      this.columnsInPlane(column.planeIndex).findIndex(
        (candidate) => candidate.columnId === column.columnId,
      ),
    );
  }

  private planeIndexes(): number[] {
    return [...new Set(this.columns.map((column) => column.planeIndex))].sort(
      (left, right) => left - right,
    );
  }

  private planeTopOffsets(viewportHeight: number): Map<number, number> {
    const offsets = new Map<number, number>();
    const planeHeight = Math.max(1, viewportHeight);
    this.planeIndexes().forEach((planeIndex, order) => {
      offsets.set(planeIndex, order * (planeHeight + planeGap));
    });
    return offsets;
  }

  private reindexColumns(): void {
    this.columns = this.columns
      .toSorted(compareColumnsByPlaneAndSlot)
      .map((column, index) => ({ ...column, index, slotIndex: columnSlotIndex(column) }));
  }

  private scrollOffsetForPlane(
    scrollColumn: number,
    geometry: ColumnGeometry,
    planeIndex: number,
  ): number {
    return this.scrollOffsetForColumn(scrollColumn, this.offsetsForPlane(planeIndex, geometry));
  }

  private totalUnscaledPlaneHeight(viewportHeight: number): number {
    const planeCount = Math.max(1, this.planeIndexes().length);
    const planeHeight = Math.max(1, viewportHeight);
    return planeCount * planeHeight + Math.max(0, planeCount - 1) * planeGap;
  }

  private totalUnscaledPlaneWidth(planeIndex: number, geometry: ColumnGeometry): number {
    const columns = this.columnsInPlane(planeIndex);
    const lastColumn = columns.at(-1);
    if (!lastColumn) {
      return minimumColumnWidth;
    }
    return (
      (geometry.offsets[lastColumn.index] ?? 0) +
      (geometry.widths[lastColumn.index] ?? minimumColumnWidth)
    );
  }

  private visiblePlaneIndexes(viewportHeight: number, verticalOffset: number): number[] {
    const planeOffsets = this.planeTopOffsets(viewportHeight);
    const planeHeight = Math.max(1, viewportHeight);
    const overscanPlanes = 1;
    const visibleOrders = new Set<number>();
    const planeIndexes = this.planeIndexes();
    for (let order = 0; order < planeIndexes.length; order += 1) {
      const planeIndex = planeIndexes[order];
      if (planeIndex === undefined) {
        continue;
      }
      const y = (planeOffsets.get(planeIndex) ?? 0) - verticalOffset;
      if (y + planeHeight < 0 || y > viewportHeight) {
        continue;
      }
      for (let offset = -overscanPlanes; offset <= overscanPlanes; offset += 1) {
        visibleOrders.add(clamp(order + offset, 0, planeIndexes.length - 1));
      }
    }
    if (visibleOrders.size === 0) {
      visibleOrders.add(0);
    }
    return [...visibleOrders]
      .sort((left, right) => left - right)
      .map((order) => planeIndexes[order])
      .filter((planeIndex): planeIndex is number => planeIndex !== undefined);
  }

  private renderedColumnIndexes(
    viewport: LayoutFrameInput["viewport"],
    scrollColumn: number,
    verticalOffset: number,
  ): number[] {
    const overscanColumns = Math.max(0, Math.floor(this.scene.renderOverscanColumns));
    const geometry = this.columnGeometry(viewport.width);
    const visiblePlaneIndexes = this.visiblePlaneIndexes(viewport.height, verticalOffset);
    if (overscanColumns === 0) {
      return this.renderedColumnIndexesWithoutOverscan(visiblePlaneIndexes, scrollColumn);
    }
    return this.renderedColumnIndexesWithOverscan(
      visiblePlaneIndexes,
      scrollColumn,
      viewport.width,
      geometry,
      overscanColumns,
    );
  }

  private renderedColumnIndexesWithoutOverscan(
    visiblePlaneIndexes: readonly number[],
    scrollColumn: number,
  ): number[] {
    const renderedColumnIndexes = new Set<number>();
    for (const planeIndex of visiblePlaneIndexes) {
      const planeColumns = this.columnsInPlane(planeIndex);
      const visibleColumnCount = Math.min(this.scene.visibleColumnCount, planeColumns.length);
      const startColumn = clamp(Math.floor(scrollColumn), 0, Math.max(0, planeColumns.length - 1));
      for (let offset = 0; offset < visibleColumnCount; offset += 1) {
        addColumnIndex(renderedColumnIndexes, planeColumns[startColumn + offset]);
      }
    }
    return sortedColumnIndexes(renderedColumnIndexes);
  }

  private renderedColumnIndexesWithOverscan(
    visiblePlaneIndexes: readonly number[],
    scrollColumn: number,
    viewportWidth: number,
    geometry: ColumnGeometry,
    overscanColumns: number,
  ): number[] {
    const renderedColumnIndexes = new Set<number>();
    for (const planeIndex of visiblePlaneIndexes) {
      const planeColumns = this.columnsInPlane(planeIndex);
      const range = this.visibleColumnRangeForPlane(
        planeIndex,
        planeColumns,
        scrollColumn,
        viewportWidth,
        geometry,
      );
      const firstRenderedColumn = Math.max(0, range.first - overscanColumns);
      const lastRenderedColumn = Math.min(planeColumns.length - 1, range.last + overscanColumns);
      for (let index = firstRenderedColumn; index <= lastRenderedColumn; index += 1) {
        addColumnIndex(renderedColumnIndexes, planeColumns[index]);
      }
    }
    return sortedColumnIndexes(renderedColumnIndexes);
  }

  private visibleColumnRangeForPlane(
    planeIndex: number,
    planeColumns: readonly NiriColumn[],
    scrollColumn: number,
    viewportWidth: number,
    geometry: ColumnGeometry,
  ): { first: number; last: number } {
    const planeOffsets = this.offsetsForPlane(planeIndex, geometry);
    const scrollOffset = this.scrollOffsetForColumn(scrollColumn, planeOffsets);
    let first = planeColumns.length;
    let last = -1;
    for (let planeColumnIndex = 0; planeColumnIndex < planeColumns.length; planeColumnIndex += 1) {
      const column = planeColumns[planeColumnIndex];
      if (column && this.columnIntersectsViewport(column, geometry, scrollOffset, viewportWidth)) {
        first = Math.min(first, planeColumnIndex);
        last = Math.max(last, planeColumnIndex);
      }
    }
    if (last >= 0) {
      return { first, last };
    }
    const fallbackColumn = clamp(Math.floor(scrollColumn), 0, Math.max(0, planeColumns.length - 1));
    return { first: fallbackColumn, last: fallbackColumn };
  }

  private columnIntersectsViewport(
    column: NiriColumn,
    geometry: ColumnGeometry,
    scrollOffset: number,
    viewportWidth: number,
  ): boolean {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    const x = this.scene.padding + (geometry.offsets[column.index] ?? 0) - scrollOffset;
    return x + columnWidth >= 0 && x <= viewportWidth;
  }

  private resolveColumnWidth(column: NiriColumn, viewportWidth: number): number {
    return this.resolveColumnWidthSpec(column.widthSpec, viewportWidth);
  }

  private resolveColumnWidthSpec(spec: ColumnWidthSpec, viewportWidth: number): number {
    if (spec.unit === "px") {
      return Math.max(minimumColumnWidth, Math.round(spec.value));
    }
    return Math.max(
      minimumColumnWidth,
      Math.round(this.availableWidth(viewportWidth) * spec.value),
    );
  }

  private rowTopOffsets(column: NiriColumn, availableHeight: number): number[] {
    return this.columnVisualFrames(column, availableHeight).map((frame) => frame.top);
  }

  private columnVisualFrames(column: NiriColumn, availableHeight: number): PaneVisualFrame[] {
    const panes = column.paneIds
      .map((paneId) => this.paneById.get(paneId))
      .filter((pane): pane is NiriPane => pane !== undefined);
    const totalWeight = panes.reduce((total, pane) => total + pane.weight, 0);
    const totalGap = this.scene.rowGap * Math.max(0, panes.length - 1);
    let top = 0;
    return panes.map((pane) => {
      const height = Math.max(42, ((availableHeight - totalGap) * pane.weight) / totalWeight);
      const frame = {
        centerY: top + height / 2,
        paneId: pane.paneId,
        top,
      };
      top += height + this.scene.rowGap;
      return frame;
    });
  }

  private overviewScale(
    viewport: LayoutFrameInput["viewport"],
    width: number,
    height: number,
  ): number {
    const fitWidth = (viewport.width - this.scene.padding * 2) / Math.max(1, width);
    const fitHeight = (viewport.height - this.scene.padding * 2) / Math.max(1, height);
    return clamp(Math.min(fitWidth, fitHeight, maximumOverviewScale), minimumOverviewScale, 1);
  }

  private scrollOffsetForColumn(scrollColumn: number, offsets: readonly number[]): number {
    if (offsets.length === 0) {
      return 0;
    }
    const maxColumn = offsets.length - 1;
    const clamped = clamp(scrollColumn, 0, maxColumn);
    const lowerColumn = Math.floor(clamped);
    const upperColumn = Math.min(maxColumn, lowerColumn + 1);
    const progress = clamped - lowerColumn;
    const lowerOffset = offsets[lowerColumn] ?? 0;
    const upperOffset = offsets[upperColumn] ?? lowerOffset;
    return lowerOffset + (upperOffset - lowerOffset) * progress;
  }

  private scrollColumnForOffset(scrollOffset: number, offsets: readonly number[]): number {
    if (offsets.length === 0) {
      return 0;
    }
    const clampedOffset = clamp(scrollOffset, offsets[0] ?? 0, offsets[offsets.length - 1] ?? 0);
    for (let index = 0; index < offsets.length - 1; index += 1) {
      const lowerOffset = offsets[index] ?? 0;
      const upperOffset = offsets[index + 1] ?? lowerOffset;
      if (clampedOffset > upperOffset) {
        continue;
      }
      const span = upperOffset - lowerOffset;
      if (span <= 0) {
        return index;
      }
      return index + (clampedOffset - lowerOffset) / span;
    }
    return offsets.length - 1;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addColumnIndex(target: Set<number>, column: NiriColumn | undefined): void {
  if (column) {
    target.add(column.index);
  }
}

function sortedColumnIndexes(indexes: ReadonlySet<number>): number[] {
  return [...indexes].sort((left, right) => left - right);
}

function nearestPaneByVerticalCenter(
  frames: readonly PaneVisualFrame[],
  centerY: number,
): PaneId | null {
  let nearest: PaneVisualFrame | null = null;
  for (const frame of frames) {
    if (!nearest || Math.abs(frame.centerY - centerY) < Math.abs(nearest.centerY - centerY)) {
      nearest = frame;
    }
  }
  return nearest?.paneId ?? null;
}

function nearestColumnWidthPreset(value: number): number {
  let nearest = columnWidthPresets[0];
  for (const preset of columnWidthPresets) {
    if (Math.abs(preset - value) < Math.abs(nearest - value)) {
      nearest = preset;
    }
  }
  return nearest;
}

function nextNumericSuffix<T>(
  items: readonly T[],
  prefix: string,
  idForItem: (item: T) => string,
): number {
  let next = 0;
  for (const item of items) {
    const id = idForItem(item);
    if (!id.startsWith(prefix)) {
      continue;
    }
    const parsed = Number.parseInt(id.slice(prefix.length), 10);
    if (Number.isInteger(parsed)) {
      next = Math.max(next, parsed + 1);
    }
  }
  return next;
}

function normalizedColumnWidthSpec(spec: ColumnWidthSpec): ColumnWidthSpec {
  if (spec.unit === "px") {
    return { unit: "px", value: Math.max(minimumColumnWidth, spec.value) };
  }
  return { unit: "proportion", value: clamp(spec.value, 0.1, 1) };
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
