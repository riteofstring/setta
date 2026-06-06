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

type PaneDirection = "up" | "down" | "left" | "right";
type PaneLocation = { columnIndex: number; rowIndex: number };
type PaneVisualFrame = { centerY: number; paneId: PaneId; top: number };

const columnWidthPresets = [1 / 3, 0.5, 2 / 3, 1] as const;
const minimumColumnWidth = 96;
const maximumOverviewScale = 0.42;
const minimumOverviewScale = 0.12;

export class NiriLikeLayoutEngine implements LayoutEngine {
  private columns: NiriColumn[];
  private nextColumnSequence: number;
  private paneById: Map<PaneId, NiriPane>;
  private nextPaneSequence: number;

  constructor(private readonly scene: NiriWorkspaceScene) {
    this.columns = scene.columns.map((column) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      paneIds: [...column.paneIds],
      widthSpec: { ...column.widthSpec },
    }));
    this.paneById = new Map(scene.paneById);
    this.nextColumnSequence = nextNumericSuffix(this.columns, "niri_column_");
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
      return this.paneInVerticalVisualDirection(source, direction, availableHeight);
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

    const geometry = this.columnGeometry(input.viewport.width);
    const scrollColumn = this.constrainScrollColumnToViewport(
      input.scrollColumn,
      input.viewport.width,
      geometry,
    );
    const scrollOffset = this.scrollOffsetForColumn(scrollColumn, geometry.offsets);
    const availableHeight = this.availablePaneHeight(input.viewport.height);
    const verticalOffset = this.verticalScrollOffset(
      input.focusedPaneId,
      availableHeight,
      input.scrollRow,
    );
    const activeMaximizedPaneId = activeMaximizedPaneIdFor(input);

    for (const columnIndex of this.renderedColumnIndexes(input.viewport.width, scrollColumn)) {
      const column = this.columns[columnIndex];
      if (!column) {
        continue;
      }
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      const x = this.scene.padding + (geometry.offsets[column.index] ?? 0) - scrollOffset;
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
        yOffset: -verticalOffset,
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
      const columnId = this.insertAdjacentColumn(source.columnIndex, direction).columnId;
      return this.openPane({ columnId });
    }
    const createdPaneId = this.openPane({ columnId: this.columns[source.columnIndex]?.columnId });
    this.insertPaneBesideSource(createdPaneId, source, direction);
    return createdPaneId;
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

  scrollColumnForFocusedColumnVisibility(
    focusedColumnIndex: number,
    currentScrollColumn: number,
    viewportWidth: number,
  ): number {
    void currentScrollColumn;
    return this.constrainScrollColumnToViewport(focusedColumnIndex, viewportWidth);
  }

  totalColumnOverflowWidth(viewportWidth: number): number {
    const geometry = this.columnGeometry(viewportWidth);
    const lastColumnIndex = this.columns.length - 1;
    const lastOffset = geometry.offsets[lastColumnIndex] ?? 0;
    const lastWidth = geometry.widths[lastColumnIndex] ?? 0;
    return this.scene.padding * 2 + lastOffset + lastWidth;
  }

  toScene(id: string = this.scene.id): NiriWorkspaceScene {
    const columns = this.columns.map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
      widthSpec: { ...column.widthSpec },
    }));
    const panes = [...this.paneById.values()].sort((left, right) => left.sequence - right.sequence);
    return {
      ...this.scene,
      columns,
      id,
      paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
      panes,
      panesPerColumn: Math.max(1, ...columns.map((column) => column.paneIds.length)),
      totalPanes: panes.length,
      visibleColumnCount: Math.min(this.scene.visibleColumnCount, Math.max(1, columns.length)),
    };
  }

  private appendColumn(widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec): NiriColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const column: NiriColumn = {
      columnId: this.nextColumnId(),
      idealWidthSpec: { ...normalizedWidthSpec },
      index: this.columns.length,
      paneIds: [],
      previousProportionWidth:
        normalizedWidthSpec.unit === "proportion" ? normalizedWidthSpec.value : undefined,
      widthSpec: { ...normalizedWidthSpec },
    };
    this.columns.push(column);
    return column;
  }

  private availablePaneHeight(viewportHeight: number): number {
    return Math.max(1, viewportHeight - this.scene.padding * 2 - 28);
  }

  private availableWidth(viewportWidth: number): number {
    return Math.max(minimumColumnWidth, viewportWidth - this.scene.padding * 2);
  }

  private columnGeometry(viewportWidth: number): { offsets: number[]; widths: number[] } {
    const widths = this.columns.map((column) => this.resolveColumnWidth(column, viewportWidth));
    const offsets: number[] = [];
    let nextOffset = 0;
    for (const width of widths) {
      offsets.push(nextOffset);
      nextOffset += width + this.scene.columnGap;
    }
    return { offsets, widths };
  }

  private constrainScrollColumnToViewport(
    scrollColumn: number,
    viewportWidth: number,
    geometry = this.columnGeometry(viewportWidth),
  ): number {
    const requestedScrollColumn = clamp(scrollColumn, 0, this.maxScrollColumn());
    const requestedOffset = this.scrollOffsetForColumn(requestedScrollColumn, geometry.offsets);
    const maximumFilledViewportOffset = Math.max(
      0,
      this.scene.padding * 2 + this.totalUnscaledColumnWidth(geometry) - viewportWidth,
    );
    if (requestedOffset <= maximumFilledViewportOffset) {
      return requestedScrollColumn;
    }
    return this.scrollColumnForOffset(maximumFilledViewportOffset, geometry.offsets);
  }

  private insertAdjacentColumn(columnIndex: number, direction: "left" | "right"): NiriColumn {
    const index = direction === "left" ? columnIndex : columnIndex + 1;
    return this.insertColumnAt(index);
  }

  private insertColumnAfter(
    adjacentToColumnId: ColumnId | undefined,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): NiriColumn {
    if (!adjacentToColumnId) {
      return this.appendColumn(widthSpec);
    }
    const adjacentColumnIndex = this.columns.findIndex(
      (column) => column.columnId === adjacentToColumnId,
    );
    if (adjacentColumnIndex < 0) {
      throw new Error(`cannot open pane next to unknown niri column ${adjacentToColumnId}`);
    }
    return this.insertColumnAt(adjacentColumnIndex + 1, widthSpec);
  }

  private insertColumnAt(
    index: number,
    widthSpec: ColumnWidthSpec = this.scene.defaultColumnWidthSpec,
  ): NiriColumn {
    const normalizedWidthSpec = normalizedColumnWidthSpec(widthSpec);
    const column: NiriColumn = {
      columnId: this.nextColumnId(),
      idealWidthSpec: { ...normalizedWidthSpec },
      index,
      paneIds: [],
      previousProportionWidth:
        normalizedWidthSpec.unit === "proportion" ? normalizedWidthSpec.value : undefined,
      widthSpec: { ...normalizedWidthSpec },
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
    const targetColumnId = this.columns[targetColumn]?.columnId;
    const pane = this.paneById.get(paneId);
    if (pane && targetColumnId) {
      this.paneById.set(paneId, { ...pane, columnId: targetColumnId });
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
    const targetColumnIndex = source.columnIndex + (direction === "left" ? -1 : 1);
    const targetColumn = this.columns[targetColumnIndex];
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
    availableHeight: number,
  ): PaneId | null {
    const column = this.columns[source.columnIndex];
    if (!column) {
      return null;
    }
    const frames = this.columnVisualFrames(column, availableHeight);
    const targetRowIndex = source.rowIndex + (direction === "up" ? -1 : 1);
    return frames[targetRowIndex]?.paneId ?? null;
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
    let y = yOffset + (this.scene.padding + 28) * scale;

    for (const pane of panes) {
      const height = Math.max(42, ((availableHeight - totalGap) * pane.weight) / totalWeight);
      const focused = pane.paneId === focusedPaneId;
      const frame = paneFrame({
        activeMaximizedPaneId,
        columnWidth,
        focused,
        height,
        maximizedViewport,
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
    const unscaledWidth = this.totalUnscaledColumnWidth(geometry);
    const unscaledHeight = Math.max(1, input.viewport.height - this.scene.padding);
    const scale = this.overviewScale(input.viewport, unscaledWidth, unscaledHeight);
    const xOffset = Math.max(
      this.scene.padding,
      Math.floor((input.viewport.width - unscaledWidth * scale) / 2),
    );
    const yOffset = Math.max(0, Math.floor((input.viewport.height - unscaledHeight * scale) / 2));
    const availableHeight = Math.max(1, input.viewport.height - this.scene.padding * 2 - 28);

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
        yOffset,
      });
    }
  }

  private maxScrollColumn(): number {
    return Math.max(0, this.columns.length - 1);
  }

  private nextColumnId(): ColumnId {
    const columnId = `niri_column_${this.nextColumnSequence}`;
    this.nextColumnSequence += 1;
    return columnId;
  }

  private removeEmptyColumns(): void {
    this.columns = this.columns
      .filter((column) => column.paneIds.length > 0)
      .map((column, index) => ({ ...column, index }));
  }

  private requireColumn(columnId: ColumnId): NiriColumn {
    const column = this.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      throw new Error(`unknown niri column ${columnId}`);
    }
    return column;
  }

  private renderedColumnIndexes(viewportWidth: number, scrollColumn: number): number[] {
    const overscanColumns = Math.max(0, Math.floor(this.scene.renderOverscanColumns));
    if (overscanColumns === 0) {
      const visibleColumnCount = Math.min(this.scene.visibleColumnCount, this.columns.length);
      const startColumn = clamp(Math.floor(scrollColumn), 0, this.maxScrollColumn());
      return Array.from({ length: visibleColumnCount }, (_, offset) => startColumn + offset).filter(
        (columnIndex) => columnIndex < this.columns.length,
      );
    }

    const geometry = this.columnGeometry(viewportWidth);
    const scrollOffset = this.scrollOffsetForColumn(scrollColumn, geometry.offsets);
    let firstVisibleColumn = this.columns.length;
    let lastVisibleColumn = -1;

    for (const column of this.columns) {
      const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
      const x = this.scene.padding + (geometry.offsets[column.index] ?? 0) - scrollOffset;
      if (x + columnWidth < 0 || x > viewportWidth) {
        continue;
      }
      firstVisibleColumn = Math.min(firstVisibleColumn, column.index);
      lastVisibleColumn = Math.max(lastVisibleColumn, column.index);
    }

    if (lastVisibleColumn < 0) {
      const fallbackColumn = clamp(Math.floor(scrollColumn), 0, this.maxScrollColumn());
      firstVisibleColumn = fallbackColumn;
      lastVisibleColumn = fallbackColumn;
    }

    const firstRenderedColumn = Math.max(0, firstVisibleColumn - overscanColumns);
    const lastRenderedColumn = Math.min(
      this.columns.length - 1,
      lastVisibleColumn + overscanColumns,
    );
    return Array.from(
      { length: lastRenderedColumn - firstRenderedColumn + 1 },
      (_, offset) => firstRenderedColumn + offset,
    );
  }

  private resolveColumnWidth(column: NiriColumn, viewportWidth: number): number {
    const spec = column.widthSpec;
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

  private verticalScrollOffset(
    focusedPaneId: PaneId,
    availableHeight: number,
    scrollRow: number,
  ): number {
    const focusedLocation = this.locationForPane(focusedPaneId);
    if (!focusedLocation) {
      return 0;
    }
    const focusedColumn = this.columns[focusedLocation.columnIndex];
    if (!focusedColumn) {
      return 0;
    }
    return this.scrollOffsetForColumn(
      scrollRow,
      this.rowTopOffsets(focusedColumn, availableHeight),
    );
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

  private totalUnscaledColumnWidth(geometry: { offsets: number[]; widths: number[] }): number {
    const lastColumnIndex = this.columns.length - 1;
    const lastOffset = geometry.offsets[lastColumnIndex] ?? 0;
    const lastWidth = geometry.widths[lastColumnIndex] ?? 0;
    return lastOffset + lastWidth;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function activeMaximizedPaneIdFor(input: LayoutFrameInput): PaneId | null {
  if (input.maximizedPaneId !== input.focusedPaneId) {
    return null;
  }
  return input.maximizedPaneId;
}

function paneFrame({
  activeMaximizedPaneId,
  columnWidth,
  focused,
  height,
  maximizedViewport,
  paneId,
  x,
  y,
}: {
  activeMaximizedPaneId: PaneId | null;
  columnWidth: number;
  focused: boolean;
  height: number;
  maximizedViewport: LayoutFrameInput["viewport"] | null;
  paneId: PaneId;
  x: number;
  y: number;
}): {
  height: number;
  maximized: boolean;
  width: number;
  x: number;
  y: number;
  z: number;
} {
  if (paneId !== activeMaximizedPaneId || !maximizedViewport) {
    return {
      height,
      maximized: false,
      width: columnWidth,
      x,
      y,
      z: focused ? 2 : 1,
    };
  }
  return {
    height: maximizedViewport.height,
    maximized: true,
    width: maximizedViewport.width,
    x: 0,
    y: 0,
    z: 20,
  };
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

function nextNumericSuffix(columns: readonly NiriColumn[], prefix: string): number {
  let next = 0;
  for (const column of columns) {
    if (!column.columnId.startsWith(prefix)) {
      continue;
    }
    const parsed = Number.parseInt(column.columnId.slice(prefix.length), 10);
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
