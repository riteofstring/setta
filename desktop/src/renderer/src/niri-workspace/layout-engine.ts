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
  TerminalPaneConfig,
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
import {
  clamp,
  columnsByIndexes,
  type ColumnGeometry,
  isHorizontalDirection,
  isVerticalDirection,
  minimumColumnWidth,
  nearestColumnWidthPreset,
  nearestPaneByVerticalCenter,
  nextNumericSuffix,
  normalizedColumnWidthSpec,
  overviewScale,
  type PaneDirection,
  type PaneLocation,
  planeTopOffsets,
  pushColumnItems,
  renderedColumnIndexesForLayout,
  scrollOffsetForColumn,
  totalUnscaledPlaneHeight,
} from "./layout-engine-helpers";
import {
  reorderPaneColumnBefore,
  reorderPaneColumnForPlacement,
  type PaneReorderPlacement,
} from "./layout-reorder";
import { columnVisualFramesForPane, type PaneVisualFrame } from "./pane-visual-frame";

export interface NiriLayoutEngineOptions {
  allowResizedPanesToOverflowViewport?: boolean;
}

interface PaneReorderPreview {
  placement: PaneReorderPlacement;
  sourcePaneId: PaneId;
  targetPaneId: PaneId;
}

export class NiriLikeLayoutEngine implements LayoutEngine {
  private columns: NiriColumn[];
  private nextColumnSequence: number;
  private paneById: Map<PaneId, NiriPane>;
  private paneReorderPreview: PaneReorderPreview | null = null;
  private nextPaneSequence: number;

  constructor(
    private readonly scene: NiriWorkspaceScene,
    private readonly options: NiriLayoutEngineOptions = {},
  ) {
    this.columns = normalizeColumnSlots(
      scene.columns.map((column) => ({
        ...column,
        idealWidthSpec: { ...column.idealWidthSpec },
        paneIds: [...column.paneIds],
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
      terminalConfig: terminalConfigForRequest(request),
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
      terminalConfig: terminalConfigForRequest(request, pane),
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
    maximizedPaneId: PaneId | null = null,
  ): PaneId | null {
    const source = this.locationForPane(paneId);
    if (!source) {
      return null;
    }
    const availableHeight = this.availablePaneHeight(viewport.height);
    if (isVerticalDirection(direction)) {
      return this.paneInVerticalVisualDirection(
        source,
        direction,
        viewport,
        availableHeight,
        maximizedPaneId,
      );
    }
    return this.paneInHorizontalVisualDirection(
      source,
      direction,
      availableHeight,
      maximizedPaneId,
    );
  }

  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    if (this.columns.length === 0 || input.viewport.width <= 0 || input.viewport.height <= 0) {
      return;
    }

    const previewColumns = this.paneReorderPreviewColumns();
    if (!previewColumns) {
      return input.presentationMode === "overview"
        ? this.renderOverviewFrame(input, push)
        : this.renderNormalFrame(input, push);
    }

    const committedColumns = this.columns;
    this.columns = previewColumns;
    try {
      return input.presentationMode === "overview"
        ? this.renderOverviewFrame(input, push)
        : this.renderNormalFrame(input, push);
    } finally {
      this.columns = committedColumns;
    }
  }

  renamePane(paneId: PaneId, title: string): boolean {
    const pane = this.paneById.get(paneId);
    const normalizedTitle = title.trim();
    if (!pane || normalizedTitle.length === 0 || pane.title === normalizedTitle) {
      return false;
    }
    this.paneById.set(paneId, {
      ...pane,
      title: normalizedTitle,
    });
    return true;
  }

  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean {
    const result = reorderPaneColumnBefore(this.columns, sourcePaneId, targetPaneId);
    this.columns = result.columns;
    this.reindexColumns();
    return result.changed;
  }

  previewPaneReorder(
    sourcePaneId: PaneId,
    targetPaneId: PaneId,
    placement: PaneReorderPlacement,
  ): boolean {
    const nextPreview = { placement, sourcePaneId, targetPaneId };
    if (
      this.paneReorderPreview?.sourcePaneId === nextPreview.sourcePaneId &&
      this.paneReorderPreview.targetPaneId === nextPreview.targetPaneId &&
      this.paneReorderPreview.placement === nextPreview.placement
    ) {
      return false;
    }
    this.paneReorderPreview = nextPreview;
    return true;
  }

  clearPaneReorderPreview(): boolean {
    if (!this.paneReorderPreview) {
      return false;
    }
    this.paneReorderPreview = null;
    return true;
  }

  private renderNormalFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    const focusedLocation = this.locationForPane(input.focusedPaneId);
    const focusedPlaneIndex = focusedLocation?.planeIndex ?? this.planeIndexes()[0] ?? 0;
    const maximizedPaneId = input.maximizedPaneId;
    const geometry = this.columnGeometry(input.viewport.width, maximizedPaneId);
    const scrollColumn = this.constrainScrollColumnToViewport(
      input.scrollColumn,
      input.viewport.width,
      focusedPlaneIndex,
      geometry,
    );
    const availableHeight = this.availablePaneHeight(input.viewport.height);
    const verticalOffset = input.scrollRow;
    const planeOffsets = planeTopOffsets(this.planeIndexes(), input.viewport.height);
    const normalPaneSpacing = {
      padding: this.scene.padding,
      rowGap: this.scene.rowGap,
    };

    const columnIndexes = renderedColumnIndexesForLayout({
      columns: this.columns,
      geometry,
      renderAllColumns: input.renderAllColumns ?? false,
      scene: this.scene,
      scrollColumn,
      verticalOffset,
      viewport: input.viewport,
    });

    for (const column of columnsByIndexes(this.columns, columnIndexes)) {
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      const x =
        this.scene.padding +
        (geometry.offsets[column.index] ?? 0) -
        this.scrollOffsetForPlane(scrollColumn, geometry, column.planeIndex);
      const planeTop = planeOffsets.get(column.planeIndex) ?? 0;
      pushColumnItems({
        availableHeight,
        column,
        columnWidth,
        focusedPaneId: input.focusedPaneId,
        maximizedPaneId,
        moving: input.movementPhase === "moving",
        paneById: this.paneById,
        presentationMode: input.presentationMode,
        push,
        scale: 1,
        scene: normalPaneSpacing,
        x,
        yOffset: planeTop - verticalOffset,
      });
    }
  }

  private paneReorderPreviewColumns(): NiriColumn[] | null {
    if (!this.paneReorderPreview) {
      return null;
    }
    const result = reorderPaneColumnForPlacement(
      this.columns,
      this.paneReorderPreview.sourcePaneId,
      this.paneReorderPreview.targetPaneId,
      this.paneReorderPreview.placement,
    );
    return result.changed
      ? result.columns.map((column, index) => ({
          ...column,
          index,
        }))
      : null;
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

  setPaneTerminalConfig(paneId: PaneId, terminalConfig: TerminalPaneConfig): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown niri pane ${paneId}`);
    }
    if (pane.surfaceKind !== "terminal") {
      throw new Error(`niri pane ${paneId} is not a terminal pane`);
    }
    this.paneById.set(paneId, {
      ...pane,
      terminalConfig: normalizeTerminalPaneConfig(terminalConfig),
    });
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
      weight: normalizedPaneWeight(heightWeight),
    });
  }

  resizePaneSplit(
    upperPaneId: PaneId,
    lowerPaneId: PaneId,
    upperHeightWeight: number,
    lowerHeightWeight: number,
  ): boolean {
    const upperLocation = this.locationForPane(upperPaneId);
    const lowerLocation = this.locationForPane(lowerPaneId);
    if (
      !upperLocation ||
      !lowerLocation ||
      upperLocation.columnIndex !== lowerLocation.columnIndex ||
      lowerLocation.rowIndex !== upperLocation.rowIndex + 1
    ) {
      return false;
    }
    const upperPane = this.paneById.get(upperPaneId);
    const lowerPane = this.paneById.get(lowerPaneId);
    if (!upperPane || !lowerPane) {
      return false;
    }
    this.paneById.set(upperPaneId, {
      ...upperPane,
      weight: normalizedPaneWeight(upperHeightWeight),
    });
    this.paneById.set(lowerPaneId, {
      ...lowerPane,
      weight: normalizedPaneWeight(lowerHeightWeight),
    });
    return true;
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

  verticalScrollOffsetForPane(
    paneId: PaneId,
    viewportHeight: number,
    maximizedPaneId: PaneId | null = null,
  ): number {
    const location = this.locationForPane(paneId);
    if (!location) {
      return 0;
    }
    const focusedColumn = this.columns[location.columnIndex];
    if (!focusedColumn) {
      return 0;
    }
    const availableHeight = this.availablePaneHeight(viewportHeight);
    const planeOffset =
      planeTopOffsets(this.planeIndexes(), viewportHeight).get(location.planeIndex) ?? 0;
    return (
      planeOffset +
      scrollOffsetForColumn(
        location.rowIndex,
        this.columnVisualFrames(focusedColumn, availableHeight, maximizedPaneId).map(
          (frame) => frame.top,
        ),
      )
    );
  }

  scrollColumnForFocusedColumnVisibility(
    focusedColumnIndex: number,
    currentScrollColumn: number,
    viewportWidth: number,
    maximizedPaneId: PaneId | null = null,
  ): number {
    const focusedColumn = this.columns[focusedColumnIndex];
    const focusedPlaneIndex = focusedColumn?.planeIndex ?? 0;
    if (!focusedColumn) {
      return this.constrainScrollColumnToViewport(
        currentScrollColumn,
        viewportWidth,
        focusedPlaneIndex,
        this.columnGeometry(viewportWidth, maximizedPaneId, 0),
      );
    }
    const geometry = this.columnGeometry(viewportWidth, maximizedPaneId, 0);
    return this.constrainScrollColumnToViewport(
      this.planeColumnIndex(focusedColumn),
      viewportWidth,
      focusedPlaneIndex,
      geometry,
    );
  }

  totalColumnOverflowWidth(viewportWidth: number): number {
    const geometry = this.columnGeometry(viewportWidth, null, 0);
    return this.scene.padding * 2 + this.maxUnscaledPlaneWidth(geometry);
  }

  toScene(id: string = this.scene.id): NiriWorkspaceScene {
    const columns = this.columns.map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
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

  private availableViewportWidth(viewportWidth: number): number {
    return Math.max(1, viewportWidth - this.scene.padding * 2);
  }

  private columnGeometry(
    viewportWidth: number,
    maximizedPaneId: PaneId | null = null,
    columnGap = this.scene.columnGap,
    allowViewportOverflow = this.options.allowResizedPanesToOverflowViewport ?? false,
  ): ColumnGeometry {
    const widths = this.columns.map((column) =>
      maximizedPaneId && column.paneIds.includes(maximizedPaneId)
        ? this.availableWidth(viewportWidth)
        : this.resolveColumnWidth(column, viewportWidth, allowViewportOverflow),
    );
    const offsets = Array.from({ length: this.columns.length }, () => 0);
    const slotOffsets = slotOffsetsForColumns({
      columnGap,
      columns: this.columns,
      defaultWidth: this.resolveColumnWidthSpec(
        this.scene.defaultColumnWidthSpec,
        viewportWidth,
        allowViewportOverflow,
      ),
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
    return clamp(scrollColumn, 0, Math.max(0, planeOffsets.length - 1));
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
    maximizedPaneId: PaneId | null,
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
    const sourceFrame = this.columnVisualFrames(sourceColumn, availableHeight, maximizedPaneId)[
      source.rowIndex
    ];
    if (!sourceFrame) {
      return null;
    }
    return nearestPaneByVerticalCenter(
      this.columnVisualFrames(targetColumn, availableHeight, maximizedPaneId),
      sourceFrame.centerY,
    );
  }

  private paneInVerticalVisualDirection(
    source: PaneLocation,
    direction: "up" | "down",
    viewport: LayoutFrameInput["viewport"],
    availableHeight: number,
    maximizedPaneId: PaneId | null,
  ): PaneId | null {
    const column = this.columns[source.columnIndex];
    if (!column) {
      return null;
    }
    const frames = this.columnVisualFrames(column, availableHeight, maximizedPaneId);
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
      this.columnVisualFrames(targetColumn, availableHeight, maximizedPaneId),
      sourceFrame?.centerY ?? 0,
    );
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
    const geometry = this.columnGeometry(input.viewport.width, null, this.scene.columnGap, true);
    const unscaledWidth = this.maxUnscaledPlaneWidth(geometry);
    const unscaledHeight = totalUnscaledPlaneHeight(
      this.planeIndexes().length,
      input.viewport.height,
    );
    const scale = overviewScale(input.viewport, unscaledWidth, unscaledHeight, this.scene.padding);
    const xOffset = Math.max(
      this.scene.padding,
      Math.floor((input.viewport.width - unscaledWidth * scale) / 2),
    );
    const yOffset = Math.max(0, Math.floor((input.viewport.height - unscaledHeight * scale) / 2));
    const availableHeight = this.availablePaneHeight(input.viewport.height);
    const planeOffsets = planeTopOffsets(this.planeIndexes(), input.viewport.height);

    for (const column of this.columns) {
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      pushColumnItems({
        availableHeight,
        column,
        columnWidth,
        focusedPaneId: input.focusedPaneId,
        moving: input.movementPhase === "moving",
        paneById: this.paneById,
        presentationMode: input.presentationMode,
        push,
        scale,
        scene: this.scene,
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
    const geometry = this.columnGeometry(viewportWidth, null, 0);
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
    return scrollOffsetForColumn(scrollColumn, this.offsetsForPlane(planeIndex, geometry));
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

  private resolveColumnWidth(
    column: NiriColumn,
    viewportWidth: number,
    allowViewportOverflow = this.options.allowResizedPanesToOverflowViewport ?? false,
  ): number {
    return this.resolveColumnWidthSpec(column.widthSpec, viewportWidth, allowViewportOverflow);
  }

  private resolveColumnWidthSpec(
    spec: ColumnWidthSpec,
    viewportWidth: number,
    allowViewportOverflow = this.options.allowResizedPanesToOverflowViewport ?? false,
  ): number {
    if (spec.unit === "px") {
      const desiredWidth = Math.max(minimumColumnWidth, Math.round(spec.value));
      return allowViewportOverflow
        ? desiredWidth
        : Math.min(desiredWidth, this.availableViewportWidth(viewportWidth));
    }
    return Math.max(
      minimumColumnWidth,
      Math.round(this.availableWidth(viewportWidth) * spec.value),
    );
  }

  private columnVisualFrames(
    column: NiriColumn,
    availableHeight: number,
    maximizedPaneId: PaneId | null = null,
  ): PaneVisualFrame[] {
    return columnVisualFramesForPane({
      availableHeight,
      column,
      maximizedPaneId,
      paneById: this.paneById,
      rowGap: this.scene.rowGap,
    });
  }
}

function terminalConfigForRequest(
  request: OpenPaneRequest,
  existing?: NiriPane,
): TerminalPaneConfig | undefined {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  if (surfaceKind !== "terminal") {
    return undefined;
  }
  return normalizeTerminalPaneConfig(request.terminalConfig ?? existing?.terminalConfig);
}

function normalizeTerminalPaneConfig(config: TerminalPaneConfig | undefined): TerminalPaneConfig {
  return {
    cwdOverride: normalizedOptionalString(config?.cwdOverride),
    profileId: normalizedOptionalString(config?.profileId) ?? "",
    titleOverride: normalizedOptionalString(config?.titleOverride),
  };
}

function normalizedPaneWeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0.1, value) : 1;
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
