import type {
  ColumnId,
  ColumnWidthSpec,
  LayoutEngine,
  LayoutFrameInput,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  OpenPaneRequest,
  PaneDropIntent,
  PaneId,
  PaneInsertionPlacement,
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
  slotWidthsForColumns,
} from "./column-slots";
import {
  clamp,
  type ColumnGeometry,
  isHorizontalDirection,
  isVerticalDirection,
  minimumColumnWidth,
  nearestColumnWidthPreset,
  nextNumericSuffix,
  normalizedColumnWidthSpec,
  type PaneDirection,
  type PaneLocation,
  planeGeometryForLayout,
  scrollOffsetForColumn,
} from "./layout-engine-helpers";
import {
  normalizedPaneHeightPx,
  normalizedPaneWeight,
  normalizeTerminalPaneConfig,
  terminalConfigForRequest,
} from "./layout-engine-normalization";
import {
  paneInHorizontalVisualDirection,
  paneInVerticalVisualDirection,
} from "./layout-engine-navigation";
import { renderNormalLayoutFrame, renderOverviewLayoutFrame } from "./layout-engine-rendering";
import {
  applyPaneDropIntentToColumns,
  reorderPaneColumnBefore,
  type PaneDropColumnResult,
  type PaneReorderPlacement,
} from "./layout-reorder";
import { columnVisualFramesForPane, type PaneVisualFrame } from "./pane-visual-frame";

export interface WorkspaceLayoutEngineOptions {
  allowResizedPanesToOverflowViewport?: boolean;
  overviewCardMaxWidthPx?: number;
  overviewCardMinWidthPx?: number;
}

interface PaneReorderPreview {
  intent: PaneDropIntent;
  sourcePaneId: PaneId;
}

export class WorkspaceLikeLayoutEngine implements LayoutEngine {
  private columns: WorkspaceColumn[];
  private compactLayout = false;
  private nextColumnSequence: number;
  private paneById: Map<PaneId, WorkspacePane>;
  private paneReorderPreview: PaneReorderPreview | null = null;
  private nextPaneSequence: number;

  constructor(
    private readonly scene: WorkspaceScene,
    private readonly options: WorkspaceLayoutEngineOptions = {},
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
      "workspace_column_",
      (column) => column.columnId,
    );
    this.nextPaneSequence = Math.max(
      scene.totalPanes,
      nextNumericSuffix(scene.panes, "workspace_pane_", (pane) => pane.paneId),
    );
  }

  // Compact (mobile-width) presentation: every column spans the full viewport
  // width and every pane the full viewport height, so navigation pages between
  // full-screen panes. Column width specs are untouched, so the regular layout
  // is restored when the viewport widens again.
  setCompactLayout(compact: boolean): void {
    this.compactLayout = compact;
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
    const pane: WorkspacePane = {
      columnId: targetColumn.columnId,
      heat: (sequence * 37) % 100,
      paneId: `workspace_pane_${sequence}`,
      sequence,
      subtitle: request.subtitle ?? "workspace surface",
      surfaceId: `workspace_surface_${sequence}`,
      surfaceKind: request.surfaceKind ?? "empty-frame",
      terminalConfig: terminalConfigForRequest(request),
      title: request.title ?? `Pane ${String(sequence + 1).padStart(3, "0")}`,
      tone: request.tone ?? "slate",
      weight: request.weight ?? 1,
    };
    this.paneById.set(pane.paneId, pane);
    targetColumn.paneIds.push(pane.paneId);
    return pane.paneId;
  }

  openPaneNearPane(
    paneId: PaneId,
    placement: PaneInsertionPlacement,
    request: OpenPaneRequest,
  ): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane(request);
    }
    if (placement === "right") {
      const columnId = this.insertAdjacentColumn(source, "right", request.widthSpec).columnId;
      return this.openPane({ ...request, columnId });
    }
    const sourceColumn = this.columns[source.columnIndex];
    const widthSpec = request.widthSpec ?? sourceColumn?.widthSpec;
    const columnId = this.insertColumnInPlaneSlot(
      source.planeIndex + (placement === "above" ? -1 : 1),
      sourceColumn ? columnSlotIndex(sourceColumn) : source.planeColumnIndex,
      widthSpec,
    ).columnId;
    return this.openPane({ ...request, columnId });
  }

  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown workspace pane ${paneId}`);
    }
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    this.paneById.set(paneId, {
      ...pane,
      heat: (sequence * 37) % 100,
      subtitle: request.subtitle ?? pane.subtitle,
      surfaceId: `workspace_surface_${sequence}`,
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
    const columnVisualFrames = (column: WorkspaceColumn) =>
      this.columnVisualFrames(column, availableHeight, maximizedPaneId);
    if (isVerticalDirection(direction)) {
      return paneInVerticalVisualDirection({
        adjacentPlaneIndex: (planeIndex, targetDirection) =>
          this.adjacentPlaneIndex(planeIndex, targetDirection),
        columnVisualFrames,
        columns: this.columns,
        direction,
        nearestColumnInPlaneByHorizontalCenter: (planeIndex, targetSource) =>
          this.nearestColumnInPlaneByHorizontalCenter(planeIndex, targetSource, viewport.width),
        source,
        viewport,
      });
    }
    return paneInHorizontalVisualDirection({
      columns: this.columns,
      direction,
      source,
    });
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

  applyPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    const result = applyPaneDropIntentToColumns(
      this.columns,
      sourcePaneId,
      intent,
      this.paneDropColumnOptions(sourcePaneId, intent),
    );
    if (!result.changed) {
      return false;
    }
    this.columns = result.columns;
    if (intent.kind === "column") {
      this.nextColumnSequence += 1;
    }
    if (intent.kind === "swap") {
      this.applyPaneSwapState(sourcePaneId, intent.targetPaneId);
    } else {
      this.applyPaneDropPaneState(sourcePaneId, result);
    }
    this.reindexColumns();
    return true;
  }

  // A swap exchanges two panes' slots, so both panes' column back-references
  // change. The generic pane-state path only knows the source, so handle the
  // pair here.
  private applyPaneSwapState(sourcePaneId: PaneId, targetPaneId: PaneId): void {
    const sourcePane = this.paneById.get(sourcePaneId);
    const targetPane = this.paneById.get(targetPaneId);
    if (!sourcePane || !targetPane) {
      return;
    }
    const sourceColumnId = sourcePane.columnId;
    this.paneById.set(sourcePaneId, { ...sourcePane, columnId: targetPane.columnId });
    this.paneById.set(targetPaneId, { ...targetPane, columnId: sourceColumnId });
  }

  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean {
    const result = reorderPaneColumnBefore(this.columns, sourcePaneId, targetPaneId);
    if (!result.changed) {
      return false;
    }
    this.columns = result.columns;
    this.applyPaneDropPaneState(sourcePaneId, result);
    this.reindexColumns();
    return true;
  }

  previewPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    const nextPreview = { intent, sourcePaneId };
    if (
      this.paneReorderPreview?.sourcePaneId === nextPreview.sourcePaneId &&
      samePaneDropIntent(this.paneReorderPreview.intent, nextPreview.intent)
    ) {
      return false;
    }
    this.paneReorderPreview = nextPreview;
    return true;
  }

  previewPaneReorder(
    sourcePaneId: PaneId,
    targetPaneId: PaneId,
    placement: PaneReorderPlacement,
  ): boolean {
    return this.previewPaneDropIntent(sourcePaneId, {
      kind: "row",
      placement,
      targetPaneId,
    });
  }

  clearPaneReorderPreview(): boolean {
    if (!this.paneReorderPreview) {
      return false;
    }
    this.paneReorderPreview = null;
    return true;
  }

  hasPaneReorderPreview(): boolean {
    return this.paneReorderPreview !== null;
  }

  private renderNormalFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    renderNormalLayoutFrame({
      availableHeight: this.availablePaneHeight(input.viewport.height),
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      geometry: this.columnGeometry(input.viewport.width, input.maximizedPaneId),
      input,
      paneById: this.paneById,
      planeIndexes: this.planeIndexes(),
      push,
      scene: this.renderScene(),
    });
  }

  private paneReorderPreviewColumns(): WorkspaceColumn[] | null {
    if (!this.paneReorderPreview) {
      return null;
    }
    // A swap previews as a target-pane highlight only (no layout reflow), so the
    // committed columns render unchanged while the drag is in progress.
    if (this.paneReorderPreview.intent.kind === "swap") {
      return null;
    }
    const result = applyPaneDropIntentToColumns(
      this.columns,
      this.paneReorderPreview.sourcePaneId,
      this.paneReorderPreview.intent,
      this.paneDropColumnOptions(
        this.paneReorderPreview.sourcePaneId,
        this.paneReorderPreview.intent,
        "preview",
      ),
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
    const slotIndex = columnSlotIndex(column);
    for (const slotColumn of this.columns) {
      if (columnSlotIndex(slotColumn) !== slotIndex) {
        continue;
      }
      const previousProportion =
        slotColumn.widthSpec.unit === "proportion"
          ? slotColumn.widthSpec.value
          : slotColumn.previousProportionWidth;
      slotColumn.previousProportionWidth = previousProportion;
      slotColumn.widthSpec = { unit: "px", value: Math.max(minimumColumnWidth, resolvedWidth) };
    }
  }

  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void {
    const column = this.requireColumn(columnId);
    this.resizeColumnsInSlot(columnSlotIndex(column), width);
  }

  setPaneTerminalConfig(paneId: PaneId, terminalConfig: TerminalPaneConfig): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown workspace pane ${paneId}`);
    }
    if (pane.surfaceKind !== "terminal") {
      throw new Error(`workspace pane ${paneId} is not a terminal pane`);
    }
    this.paneById.set(paneId, {
      ...pane,
      terminalConfig: normalizeTerminalPaneConfig(terminalConfig),
    });
  }

  resetColumnWidth(columnId: ColumnId): void {
    const column = this.requireColumn(columnId);
    this.resizeColumnsInSlot(columnSlotIndex(column), column.idealWidthSpec);
  }

  resizePane(paneId: PaneId, heightPx: number | null): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      return;
    }
    const nextHeightPx = normalizedPaneHeightPx(heightPx);
    this.paneById.set(paneId, {
      ...pane,
      ...(nextHeightPx === null ? { heightPx: undefined } : { heightPx: nextHeightPx }),
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
      sourceColumn?.widthSpec,
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
    this.resizeColumnsInSlot(columnSlotIndex(column), {
      unit: "proportion",
      value: nearestColumnWidthPreset(unlockedProportion),
    });
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
    const planeGeometry = planeGeometryForLayout({
      availableHeight,
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      maximizedPaneId,
      padding: this.renderScene().padding,
      paneById: this.paneById,
      planeGap: this.scene.columnGap,
      planeIndexes: this.planeIndexes(),
      rowGap: this.scene.rowGap,
      viewportHeight,
    });
    const planeOffset = planeGeometry.offsets.get(location.planeIndex) ?? 0;
    if (!this.compactLayout) {
      return planeOffset;
    }
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
    const geometry = this.columnGeometry(viewportWidth, maximizedPaneId, 0);
    if (!focusedColumn) {
      return this.constrainScrollColumnToViewport(currentScrollColumn, viewportWidth, geometry);
    }
    return this.constrainScrollColumnToViewport(
      this.scrollColumnForColumn(focusedColumn),
      viewportWidth,
      geometry,
    );
  }

  horizontalScrollColumnForPane(paneId: PaneId): number {
    const location = this.locationForPane(paneId);
    const column = location ? this.columns[location.columnIndex] : undefined;
    return column ? this.scrollColumnForColumn(column) : 0;
  }

  totalColumnOverflowWidth(viewportWidth: number): number {
    const geometry = this.columnGeometry(viewportWidth, null, 0);
    return this.scenePadding() * 2 + this.maxUnscaledPlaneWidth(geometry);
  }

  toScene(id: string = this.scene.id): WorkspaceScene {
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
  ): WorkspaceColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const column: WorkspaceColumn = {
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

  private scenePadding(): number {
    return this.compactLayout ? 0 : this.scene.padding;
  }

  private compactRenderScene: WorkspaceScene | null = null;

  private renderScene(): WorkspaceScene {
    if (!this.compactLayout) {
      return this.scene;
    }
    this.compactRenderScene ??= { ...this.scene, padding: 0 };
    return this.compactRenderScene;
  }

  private availablePaneHeight(viewportHeight: number): number {
    return Math.max(1, viewportHeight - this.scenePadding() * 2);
  }

  private availableWidth(viewportWidth: number): number {
    return Math.max(minimumColumnWidth, viewportWidth - this.scenePadding() * 2);
  }

  private availableViewportWidth(viewportWidth: number): number {
    return Math.max(1, viewportWidth - this.scenePadding() * 2);
  }

  private columnGeometry(
    viewportWidth: number,
    maximizedPaneId: PaneId | null = null,
    columnGap = this.scene.columnGap,
    allowViewportOverflow = this.options.allowResizedPanesToOverflowViewport ?? false,
  ): ColumnGeometry {
    const rawWidths = this.columns.map((column) =>
      this.compactLayout || (maximizedPaneId && column.paneIds.includes(maximizedPaneId))
        ? this.availableWidth(viewportWidth)
        : this.resolveColumnWidth(column, viewportWidth, allowViewportOverflow),
    );
    const defaultWidth = this.resolveColumnWidthSpec(
      this.scene.defaultColumnWidthSpec,
      viewportWidth,
      allowViewportOverflow,
    );
    const slotWidths = slotWidthsForColumns({
      columns: this.columns,
      defaultWidth,
      widths: rawWidths,
    });
    const widths = this.columns.map(
      (column) =>
        slotWidths.get(columnSlotIndex(column)) ?? rawWidths[column.index] ?? defaultWidth,
    );
    const offsets = Array.from({ length: this.columns.length }, () => 0);
    const slotOffsets = slotOffsetsForColumns({
      columnGap,
      columns: this.columns,
      defaultWidth,
      widths,
    });
    for (const planeIndex of this.planeIndexes()) {
      for (const column of this.columnsInPlane(planeIndex)) {
        offsets[column.index] = slotOffsets.get(columnSlotIndex(column)) ?? 0;
      }
    }
    const scrollOffsets = [...slotOffsets.entries()]
      .toSorted(([leftSlot], [rightSlot]) => leftSlot - rightSlot)
      .map(([, offset]) => offset);
    return { offsets, scrollOffsets, widths };
  }

  private constrainScrollColumnToViewport(
    scrollColumn: number,
    viewportWidth: number,
    geometry = this.columnGeometry(viewportWidth),
  ): number {
    return clamp(scrollColumn, 0, Math.max(0, geometry.scrollOffsets.length - 1));
  }

  private insertAdjacentColumn(
    source: PaneLocation,
    direction: "left" | "right",
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): WorkspaceColumn {
    const planeColumnIndex = source.planeColumnIndex + (direction === "left" ? 0 : 1);
    return this.insertColumnInPlane(source.planeIndex, planeColumnIndex, widthSpec);
  }

  private insertColumnAfter(
    adjacentToColumnId: ColumnId | undefined,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): WorkspaceColumn {
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
  ): WorkspaceColumn {
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
  ): WorkspaceColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const normalizedSlotIndex = Math.max(0, Math.floor(slotIndex));
    if (planeHasSlot(this.columnsInPlane(planeIndex), normalizedSlotIndex)) {
      this.columns = shiftPlaneSlotsAtOrAfter(this.columns, planeIndex, normalizedSlotIndex);
    }
    const column: WorkspaceColumn = {
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

  private applyPaneDropPaneState(sourcePaneId: PaneId, result: PaneDropColumnResult): void {
    const pane = this.paneById.get(sourcePaneId);
    if (!pane || !result.destinationColumnId) {
      return;
    }
    if (!result.resetPaneSizing) {
      this.paneById.set(sourcePaneId, {
        ...pane,
        columnId: result.destinationColumnId,
      });
      return;
    }

    // Cross-column and cross-plane drops adopt the destination layout context:
    // column width belongs to the destination column, row sizing is reset to an
    // even-share weight, and pane-intrinsic surface identity stays with the pane.
    const paneWithoutHeight: WorkspacePane = {
      ...pane,
      columnId: result.destinationColumnId,
      weight: 1,
    };
    delete paneWithoutHeight.heightPx;
    this.paneById.set(sourcePaneId, paneWithoutHeight);
  }

  private paneDropColumnOptions(
    sourcePaneId: PaneId,
    intent: PaneDropIntent,
    mode: "commit" | "preview" = "commit",
  ) {
    if (intent.kind !== "column") {
      return undefined;
    }
    return {
      defaultColumnWidthSpec: this.scene.defaultColumnWidthSpec,
      newColumnId:
        mode === "preview"
          ? (`workspace_column_preview_${sourcePaneId}` as ColumnId)
          : this.peekNextColumnId(),
    };
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

  private requirePaneAt(columnIndex: number, rowIndex: number): WorkspacePane {
    const column = this.columns[clamp(columnIndex, 0, this.columns.length - 1)];
    if (!column) {
      throw new Error("workspace layout has no columns");
    }
    const paneId = column.paneIds[clamp(rowIndex, 0, column.paneIds.length - 1)];
    const pane = paneId ? this.paneById.get(paneId) : undefined;
    if (!pane) {
      throw new Error(`workspace layout column ${column.columnId} has no pane at row ${rowIndex}`);
    }
    return pane;
  }

  private renderOverviewFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    renderOverviewLayoutFrame({
      availableHeight: this.availablePaneHeight(input.viewport.height),
      cardSizeConstraints: {
        maxWidthPx: this.options.overviewCardMaxWidthPx,
        minWidthPx: this.options.overviewCardMinWidthPx,
      },
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      geometry: this.columnGeometry(
        input.viewport.width,
        input.maximizedPaneId,
        this.scene.columnGap,
        true,
      ),
      input,
      paneById: this.paneById,
      planeIndexes: this.planeIndexes(),
      push,
      scene: this.renderScene(),
    });
  }

  private nextColumnId(): ColumnId {
    const columnId = this.peekNextColumnId();
    this.nextColumnSequence += 1;
    return columnId;
  }

  private peekNextColumnId(): ColumnId {
    return `workspace_column_${this.nextColumnSequence}`;
  }

  private removeEmptyColumns(): void {
    this.columns = this.columns.filter((column) => column.paneIds.length > 0);
    this.reindexColumns();
  }

  private requireColumn(columnId: ColumnId): WorkspaceColumn {
    const column = this.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      throw new Error(`unknown workspace column ${columnId}`);
    }
    return column;
  }

  private resizeColumnsInSlot(slotIndex: number, width: ColumnWidthSpec): void {
    const normalizedWidthSpec = normalizedColumnWidthSpec(width);
    for (const column of this.columns) {
      if (columnSlotIndex(column) !== slotIndex) {
        continue;
      }
      column.widthSpec = { ...normalizedWidthSpec };
      if (column.widthSpec.unit === "proportion") {
        column.previousProportionWidth = column.widthSpec.value;
      }
    }
  }

  private adjacentPlaneIndex(planeIndex: number, direction: "up" | "down"): number | null {
    const indexes = this.planeIndexes();
    const currentIndex = indexes.indexOf(planeIndex);
    if (currentIndex < 0) {
      return null;
    }
    return indexes[currentIndex + (direction === "up" ? -1 : 1)] ?? null;
  }

  private columnsInPlane(planeIndex: number): WorkspaceColumn[] {
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
  ): WorkspaceColumn | null {
    const sourceColumn = this.columns[source.columnIndex];
    if (!sourceColumn) {
      return null;
    }
    const geometry = this.columnGeometry(viewportWidth, null, 0);
    const sourceCenter = this.columnHorizontalCenter(sourceColumn, geometry);
    let nearestColumn: WorkspaceColumn | null = null;
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

  private columnHorizontalCenter(column: WorkspaceColumn, geometry: ColumnGeometry): number {
    return (
      (geometry.offsets[column.index] ?? 0) +
      (geometry.widths[column.index] ?? minimumColumnWidth) / 2
    );
  }

  private planeColumnIndex(column: WorkspaceColumn): number {
    return Math.max(
      0,
      this.columnsInPlane(column.planeIndex).findIndex(
        (candidate) => candidate.columnId === column.columnId,
      ),
    );
  }

  private scrollColumnForColumn(column: WorkspaceColumn): number {
    const slotIndex = columnSlotIndex(column);
    const occupiedSlots = [
      ...new Set(this.columns.map((candidate) => columnSlotIndex(candidate))),
    ].toSorted((left, right) => left - right);
    return Math.max(0, occupiedSlots.indexOf(slotIndex));
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
    column: WorkspaceColumn,
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
    column: WorkspaceColumn,
    availableHeight: number,
    maximizedPaneId: PaneId | null = null,
  ): PaneVisualFrame[] {
    return columnVisualFramesForPane({
      availableHeight,
      column,
      fullSizeRows: this.compactLayout,
      maximizedPaneId,
      paneById: this.paneById,
      rowGap: this.scene.rowGap,
    });
  }
}

function samePaneDropIntent(left: PaneDropIntent, right: PaneDropIntent): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "row" && right.kind === "row") {
    return left.targetPaneId === right.targetPaneId && left.placement === right.placement;
  }
  if (left.kind === "column" && right.kind === "column") {
    return (
      left.targetColumnId === right.targetColumnId &&
      left.planeIndex === right.planeIndex &&
      left.slotPlacement === right.slotPlacement
    );
  }
  if (left.kind === "swap" && right.kind === "swap") {
    return left.targetPaneId === right.targetPaneId;
  }
  return false;
}
