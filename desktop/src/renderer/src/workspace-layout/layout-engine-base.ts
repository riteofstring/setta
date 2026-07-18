import type {
  ColumnId,
  ColumnWidthSpec,
  LayoutFrameInput,
  PaneDropIntent,
  PaneId,
  PaneRenderItem,
  Rect,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
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
  minimumColumnWidth,
  nextNumericSuffix,
  normalizedColumnWidthSpec,
  type PaneLocation,
} from "./layout-engine-helpers";
import {
  type OverviewFrameTransform,
  type OverviewLayoutContext,
  type OverviewLayoutMetrics,
  overviewLayoutMetrics,
  renderOverviewLayoutFrame,
} from "./layout-engine-rendering";
import type { PaneDropColumnResult } from "./layout-reorder";
import { columnVisualFramesForPane, type PaneVisualFrame } from "./pane-visual-frame";

export interface WorkspaceLayoutEngineOptions {
  allowResizedPanesToOverflowViewport?: boolean;
  overviewCardMaxWidthPx?: number;
  overviewCardMinWidthPx?: number;
}

export function paneDropIntentCreatesColumn(intent: PaneDropIntent): boolean {
  return intent.kind === "column" || intent.kind === "plane-slot";
}

export abstract class WorkspaceLayoutEngineBase {
  protected columns: WorkspaceColumn[];
  protected compactLayout = false;
  protected compactRenderScene: WorkspaceScene | null = null;
  protected nextColumnSequence: number;
  protected nextPaneSequence: number;
  protected nextSurfaceSequence: number;
  protected paneById: Map<PaneId, WorkspacePane>;

  constructor(
    protected readonly scene: WorkspaceScene,
    protected readonly options: WorkspaceLayoutEngineOptions = {},
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
    this.nextSurfaceSequence = Math.max(
      scene.totalPanes,
      nextNumericSuffix(scene.panes, "workspace_surface_", (pane) => pane.surfaceId),
    );
  }

  // Compact (mobile-width) presentation: every column spans the full viewport
  // width and every pane the full viewport height, so navigation pages between
  // full-screen panes. Column width specs are untouched, so the regular layout
  // is restored when the viewport widens again.
  setCompactLayout(compact: boolean): void {
    this.compactLayout = compact;
  }

  protected appendColumn(
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

  protected scenePadding(): number {
    return this.compactLayout ? 0 : this.scene.padding;
  }

  protected renderScene(): WorkspaceScene {
    if (!this.compactLayout) {
      return this.scene;
    }
    this.compactRenderScene ??= { ...this.scene, padding: 0 };
    return this.compactRenderScene;
  }

  protected availablePaneHeight(viewportHeight: number): number {
    return Math.max(1, viewportHeight - this.scenePadding() * 2);
  }

  protected availableWidth(viewportWidth: number): number {
    return Math.max(minimumColumnWidth, viewportWidth - this.scenePadding() * 2);
  }

  protected availableViewportWidth(viewportWidth: number): number {
    return Math.max(1, viewportWidth - this.scenePadding() * 2);
  }

  protected columnGeometry(
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

  protected constrainScrollColumnToViewport(
    scrollColumn: number,
    viewportWidth: number,
    geometry = this.columnGeometry(viewportWidth),
  ): number {
    return clamp(scrollColumn, 0, Math.max(0, geometry.scrollOffsets.length - 1));
  }

  protected insertAdjacentColumn(
    source: PaneLocation,
    direction: "left" | "right",
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): WorkspaceColumn {
    const planeColumnIndex = source.planeColumnIndex + (direction === "left" ? 0 : 1);
    return this.insertColumnInPlane(source.planeIndex, planeColumnIndex, widthSpec);
  }

  protected insertColumnAfter(
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

  protected insertColumnInPlane(
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

  protected insertColumnInPlaneSlot(
    planeIndex: number,
    slotIndex: number,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): WorkspaceColumn {
    const normalizedPlaneIndex = this.normalizeInsertionPlaneIndex(planeIndex);
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const normalizedSlotIndex = Math.max(0, Math.floor(slotIndex));
    if (planeHasSlot(this.columnsInPlane(normalizedPlaneIndex), normalizedSlotIndex)) {
      this.columns = shiftPlaneSlotsAtOrAfter(
        this.columns,
        normalizedPlaneIndex,
        normalizedSlotIndex,
      );
    }
    const column: WorkspaceColumn = {
      columnId: this.nextColumnId(),
      idealWidthSpec: { ...normalizedWidthSpec },
      index: this.columns.length,
      paneIds: [],
      planeIndex: normalizedPlaneIndex,
      previousProportionWidth:
        normalizedWidthSpec.unit === "proportion" ? normalizedWidthSpec.value : undefined,
      slotIndex: normalizedSlotIndex,
      widthSpec: { ...normalizedWidthSpec },
    };
    this.columns.push(column);
    this.reindexColumns();
    return this.requireColumn(column.columnId);
  }

  protected normalizeInsertionPlaneIndex(planeIndex: number): number {
    if (!Number.isFinite(planeIndex)) {
      throw new Error(`workspace layout plane index must be finite, got ${String(planeIndex)}`);
    }
    const normalizedPlaneIndex = Math.floor(planeIndex);
    if (normalizedPlaneIndex >= 0) {
      return normalizedPlaneIndex;
    }
    const offset = -normalizedPlaneIndex;
    this.columns = this.columns.map((column) => ({
      ...column,
      planeIndex: column.planeIndex + offset,
    }));
    return 0;
  }

  protected insertPaneBesideSource(
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

  protected applyPaneDropPaneState(sourcePaneId: PaneId, result: PaneDropColumnResult): void {
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

  protected paneDropColumnOptions(
    sourcePaneId: PaneId,
    intent: PaneDropIntent,
    mode: "commit" | "preview" = "commit",
  ) {
    if (!paneDropIntentCreatesColumn(intent)) {
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

  protected locationForPane(paneId: PaneId): PaneLocation | null {
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

  protected movePaneToAdjacentColumn(
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

  protected movePaneWithinColumn(
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

  protected requirePaneAt(columnIndex: number, rowIndex: number): WorkspacePane {
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

  protected renderOverviewFrame(
    input: LayoutFrameInput,
    push: (item: PaneRenderItem) => void,
    frameOverride?: OverviewFrameTransform,
  ): void {
    renderOverviewLayoutFrame({ ...this.overviewLayoutContext(input), frameOverride, push });
  }

  // The committed overview frame transform (scale/centering/pan bounds), used to
  // freeze the surface while a drop preview reflows the scene. Reads the current
  // (committed) columns, so it must be called before any preview swap.
  protected overviewFrameTransform(input: LayoutFrameInput): OverviewFrameTransform {
    const { baseXOffset, baseYOffset, maxPanX, maxPanY, scale } = overviewLayoutMetrics(
      this.overviewLayoutContext(input),
    );
    return { baseXOffset, baseYOffset, maxPanX, maxPanY, scale };
  }

  overviewContentBounds(
    viewport: Rect,
    maximizedPaneId: PaneId | null = null,
    overviewZoom = 1,
  ): OverviewLayoutMetrics {
    return overviewLayoutMetrics(
      this.overviewLayoutContext({
        focusedPaneId: this.focusedPaneAt(0, 0),
        maximizedPaneId,
        movementPhase: "idle",
        overviewZoom,
        presentationMode: "overview",
        scrollColumn: 0,
        scrollRow: 0,
        viewport,
      }),
    );
  }

  protected overviewLayoutContext(input: LayoutFrameInput): OverviewLayoutContext {
    return {
      availableHeight: this.availablePaneHeight(input.viewport.height),
      cardSizeConstraints: {
        maxWidthPx: this.options.overviewCardMaxWidthPx,
        minWidthPx: this.options.overviewCardMinWidthPx,
      },
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      // Overview is the same layout as normal mode, just frozen and scaled, so it
      // must use the identical column geometry. Forcing viewport overflow here
      // sized wide/px-locked panes differently than normal, making overview pane
      // ratios wrong and forcing zoom transitions to morph widths.
      geometry: this.columnGeometry(input.viewport.width, input.maximizedPaneId),
      input,
      paneById: this.paneById,
      planeIndexes: this.planeIndexes(),
      scene: this.renderScene(),
    };
  }

  protected nextColumnId(): ColumnId {
    const columnId = this.peekNextColumnId();
    this.nextColumnSequence += 1;
    return columnId;
  }

  protected peekNextColumnId(): ColumnId {
    return `workspace_column_${this.nextColumnSequence}`;
  }

  protected removeEmptyColumns(): void {
    this.columns = this.columns.filter((column) => column.paneIds.length > 0);
    this.reindexColumns();
  }

  protected requireColumn(columnId: ColumnId): WorkspaceColumn {
    const column = this.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      throw new Error(`unknown workspace column ${columnId}`);
    }
    return column;
  }

  protected resizeColumnsInSlot(slotIndex: number, width: ColumnWidthSpec): void {
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

  protected adjacentPlaneIndex(planeIndex: number, direction: "up" | "down"): number | null {
    const indexes = this.planeIndexes();
    const currentIndex = indexes.indexOf(planeIndex);
    if (currentIndex < 0) {
      return null;
    }
    return indexes[currentIndex + (direction === "up" ? -1 : 1)] ?? null;
  }

  protected columnsInPlane(planeIndex: number): WorkspaceColumn[] {
    return this.columns.filter((column) => column.planeIndex === planeIndex);
  }

  protected maxUnscaledPlaneWidth(geometry: ColumnGeometry): number {
    return Math.max(
      minimumColumnWidth,
      ...this.planeIndexes().map((planeIndex) =>
        this.totalUnscaledPlaneWidth(planeIndex, geometry),
      ),
    );
  }

  protected nearestColumnInPlaneByHorizontalCenter(
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

  protected columnHorizontalCenter(column: WorkspaceColumn, geometry: ColumnGeometry): number {
    return (
      (geometry.offsets[column.index] ?? 0) +
      (geometry.widths[column.index] ?? minimumColumnWidth) / 2
    );
  }

  protected planeColumnIndex(column: WorkspaceColumn): number {
    return Math.max(
      0,
      this.columnsInPlane(column.planeIndex).findIndex(
        (candidate) => candidate.columnId === column.columnId,
      ),
    );
  }

  protected scrollColumnForColumn(column: WorkspaceColumn): number {
    const slotIndex = columnSlotIndex(column);
    const occupiedSlots = [
      ...new Set(this.columns.map((candidate) => columnSlotIndex(candidate))),
    ].toSorted((left, right) => left - right);
    return Math.max(0, occupiedSlots.indexOf(slotIndex));
  }

  protected planeIndexes(): number[] {
    return [...new Set(this.columns.map((column) => column.planeIndex))].sort(
      (left, right) => left - right,
    );
  }

  protected reindexColumns(): void {
    this.columns = this.columns
      .toSorted(compareColumnsByPlaneAndSlot)
      .map((column, index) => ({ ...column, index, slotIndex: columnSlotIndex(column) }));
  }

  protected totalUnscaledPlaneWidth(planeIndex: number, geometry: ColumnGeometry): number {
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

  protected resolveColumnWidth(
    column: WorkspaceColumn,
    viewportWidth: number,
    allowViewportOverflow = this.options.allowResizedPanesToOverflowViewport ?? false,
  ): number {
    return this.resolveColumnWidthSpec(column.widthSpec, viewportWidth, allowViewportOverflow);
  }

  protected resolveColumnWidthSpec(
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

  protected columnVisualFrames(
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

  abstract focusedPaneAt(columnIndex: number, rowIndex: number): PaneId;
}
