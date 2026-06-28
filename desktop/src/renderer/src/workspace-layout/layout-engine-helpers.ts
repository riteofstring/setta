import type {
  ColumnWidthSpec,
  LayoutFrameInput,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  PaneId,
  PaneRenderItem,
} from "./types";
import type { PaneVisualFrame } from "./pane-visual-frame";

export type PaneDirection = "up" | "down" | "left" | "right";
export type PaneLocation = {
  columnIndex: number;
  planeColumnIndex: number;
  planeIndex: number;
  rowIndex: number;
};
export type ColumnGeometry = { offsets: number[]; scrollOffsets: number[]; widths: number[] };
export type PlaneGeometry = {
  heights: Map<number, number>;
  offsets: Map<number, number>;
  totalHeight: number;
};

const columnWidthPresets = [1 / 3, 0.5, 2 / 3, 1] as const;
const maximumOverviewScale = 0.42;
const minimumOverviewScale = 0.12;
export const minimumColumnWidth = 96;

export interface OverviewCardSizeConstraints {
  maxWidthPx?: number;
  minWidthPx?: number;
}

export interface OverviewScaleInput {
  cardSizeConstraints?: OverviewCardSizeConstraints;
  height: number;
  padding: number;
  referenceCardWidth?: number;
  viewport: LayoutFrameInput["viewport"];
  width: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isHorizontalDirection(direction: PaneDirection): direction is "left" | "right" {
  return direction === "left" || direction === "right";
}

export function isVerticalDirection(direction: PaneDirection): direction is "up" | "down" {
  return direction === "up" || direction === "down";
}

export function nearestColumnWidthPreset(value: number): number {
  let nearest = columnWidthPresets[0];
  for (const preset of columnWidthPresets) {
    if (Math.abs(preset - value) < Math.abs(nearest - value)) {
      nearest = preset;
    }
  }
  return nearest;
}

export function nearestPaneByVerticalCenter(
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

export function nextNumericSuffix<T>(
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

export function normalizedColumnWidthSpec(spec: ColumnWidthSpec): ColumnWidthSpec {
  if (spec.unit === "px") {
    return { unit: "px", value: Math.max(minimumColumnWidth, spec.value) };
  }
  return { unit: "proportion", value: clamp(spec.value, 0.1, 1) };
}

export function overviewScale({
  cardSizeConstraints = {},
  height,
  padding,
  referenceCardWidth = 0,
  viewport,
  width,
}: OverviewScaleInput): number {
  const fitWidth = (viewport.width - padding * 2) / Math.max(1, width);
  const fitHeight = (viewport.height - padding * 2) / Math.max(1, height);
  const fitScale = Math.min(fitWidth, fitHeight);
  if (!hasOverviewCardSizeConstraint(cardSizeConstraints)) {
    return clamp(Math.min(fitScale, maximumOverviewScale), minimumOverviewScale, 1);
  }
  const scaleBounds = overviewCardScaleBounds(referenceCardWidth, cardSizeConstraints);
  return clamp(fitScale, scaleBounds.minScale, scaleBounds.maxScale);
}

function hasOverviewCardSizeConstraint({
  maxWidthPx,
  minWidthPx,
}: OverviewCardSizeConstraints): boolean {
  return isPositiveFiniteNumber(minWidthPx) || isPositiveFiniteNumber(maxWidthPx);
}

function overviewCardScaleBounds(
  referenceCardWidth: number,
  { maxWidthPx, minWidthPx }: OverviewCardSizeConstraints,
): { maxScale: number; minScale: number } {
  const normalizedReferenceWidth = Math.max(1, referenceCardWidth);
  const minScale = isPositiveFiniteNumber(minWidthPx)
    ? minWidthPx / normalizedReferenceWidth
    : minimumOverviewScale;
  const maxScale = isPositiveFiniteNumber(maxWidthPx) ? maxWidthPx / normalizedReferenceWidth : 1;
  return {
    maxScale: Math.min(1, Math.max(minScale, maxScale)),
    minScale: Math.min(1, Math.min(minScale, maxScale)),
  };
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function planeGeometryForLayout({
  availableHeight,
  columns,
  fullSizePanes = false,
  maximizedPaneId = null,
  padding,
  paneById,
  planeGap,
  planeIndexes: indexes,
  rowGap,
  viewportHeight,
}: {
  availableHeight: number;
  columns: readonly WorkspaceColumn[];
  fullSizePanes?: boolean;
  maximizedPaneId?: PaneId | null;
  padding: number;
  paneById: Map<PaneId, WorkspacePane>;
  planeGap: number;
  planeIndexes: readonly number[];
  rowGap: number;
  viewportHeight: number;
}): PlaneGeometry {
  const heights = new Map<number, number>();
  const offsets = new Map<number, number>();
  let offset = 0;
  for (const planeIndex of indexes) {
    const height = planeOuterHeightForLayout({
      availableHeight,
      columns: columnsInPlane(columns, planeIndex),
      fullSizePanes,
      maximizedPaneId,
      padding,
      paneById,
      rowGap,
      viewportHeight,
    });
    heights.set(planeIndex, height);
    offsets.set(planeIndex, offset);
    offset += height + planeGap - padding * 2;
  }
  return {
    heights,
    offsets,
    totalHeight:
      indexes.length === 0 ? Math.max(1, viewportHeight) : offset - planeGap + padding * 2,
  };
}

export function scrollOffsetForColumn(scrollColumn: number, offsets: readonly number[]): number {
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

export function pushColumnItems({
  availableHeight,
  column,
  columnWidth,
  focusedPaneId,
  fullSizePanes = false,
  maximizedPaneId = null,
  moving,
  paneById,
  presentationMode,
  push,
  scale,
  scene,
  x,
  yOffset = 0,
}: {
  availableHeight: number;
  column: WorkspaceColumn;
  columnWidth: number;
  focusedPaneId: PaneId;
  fullSizePanes?: boolean;
  maximizedPaneId?: PaneId | null;
  moving: boolean;
  paneById: Map<PaneId, WorkspacePane>;
  presentationMode: LayoutFrameInput["presentationMode"];
  push: (item: PaneRenderItem) => void;
  scale: number;
  scene: Pick<WorkspaceScene, "padding" | "rowGap">;
  x: number;
  yOffset?: number;
}) {
  const panes = column.paneIds
    .map((paneId) => paneById.get(paneId))
    .filter((pane): pane is WorkspacePane => pane !== undefined);
  const totalGap = scene.rowGap * Math.max(0, panes.length - 1);
  const heights = paneHeightsForColumn(
    panes,
    availableHeight,
    totalGap,
    fullSizePanes,
    maximizedPaneId,
  );
  let y = yOffset + scene.padding * scale;

  for (const [index, pane] of panes.entries()) {
    const maximized = pane.paneId === maximizedPaneId;
    const height = heights[index] ?? minimumPaneRenderHeightPx;
    const focused = pane.paneId === focusedPaneId;
    push({
      focused,
      height,
      maximized,
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
      width: columnWidth,
      x,
      y,
      z: focused ? 2 : 1,
    });
    y += (height + scene.rowGap) * scale;
  }
}

const minimumPaneRenderHeightPx = 42;

function planeOuterHeightForLayout({
  availableHeight,
  columns,
  fullSizePanes,
  maximizedPaneId,
  padding,
  paneById,
  rowGap,
  viewportHeight,
}: {
  availableHeight: number;
  columns: readonly WorkspaceColumn[];
  fullSizePanes: boolean;
  maximizedPaneId: PaneId | null;
  padding: number;
  paneById: Map<PaneId, WorkspacePane>;
  rowGap: number;
  viewportHeight: number;
}): number {
  if (columns.length === 0) {
    return Math.max(1, viewportHeight);
  }
  const columnHeights = columns.map((column) =>
    columnContentHeightForLayout({
      availableHeight,
      column,
      fullSizePanes,
      maximizedPaneId,
      paneById,
      rowGap,
    }),
  );
  return Math.max(1, Math.max(...columnHeights) + padding * 2);
}

function columnContentHeightForLayout({
  availableHeight,
  column,
  fullSizePanes,
  maximizedPaneId,
  paneById,
  rowGap,
}: {
  availableHeight: number;
  column: WorkspaceColumn;
  fullSizePanes: boolean;
  maximizedPaneId: PaneId | null;
  paneById: Map<PaneId, WorkspacePane>;
  rowGap: number;
}): number {
  const panes = column.paneIds
    .map((paneId) => paneById.get(paneId))
    .filter((pane): pane is WorkspacePane => pane !== undefined);
  if (panes.length === 0) {
    return Math.max(1, availableHeight);
  }
  const totalGap = rowGap * Math.max(0, panes.length - 1);
  const heights = paneHeightsForColumn(
    panes,
    availableHeight,
    totalGap,
    fullSizePanes,
    maximizedPaneId,
  );
  return heights.reduce((total, height) => total + height, 0) + totalGap;
}

export function paneHeightsForColumn(
  panes: readonly WorkspacePane[],
  availableHeight: number,
  totalGap: number,
  fullSizePanes = false,
  maximizedPaneId: PaneId | null = null,
): number[] {
  if (fullSizePanes) {
    return panes.map(() => availableHeight);
  }
  const fixedHeights: Array<number | null> = panes.map((pane) =>
    pane.paneId === maximizedPaneId
      ? availableHeight
      : pane.heightPx === undefined
        ? null
        : Math.min(availableHeight, pane.heightPx),
  );
  const fixedHeightTotal = fixedHeights.reduce<number>((total, height) => total + (height ?? 0), 0);
  const flexiblePanes = panes.filter((_pane, index) => fixedHeights[index] === null);
  const flexibleWeightTotal = flexiblePanes.reduce((total, pane) => total + pane.weight, 0);
  const flexibleHeight = Math.max(
    minimumPaneRenderHeightPx * flexiblePanes.length,
    availableHeight - totalGap - fixedHeightTotal,
  );
  return panes.map((pane, index) => {
    const fixedHeight = fixedHeights[index];
    if (fixedHeight !== null && fixedHeight !== undefined) {
      return Math.max(minimumPaneRenderHeightPx, fixedHeight);
    }
    return Math.max(
      minimumPaneRenderHeightPx,
      (flexibleHeight * pane.weight) / Math.max(0.1, flexibleWeightTotal),
    );
  });
}

export function renderedColumnIndexesForLayout({
  columns,
  geometry,
  planeGeometry,
  renderAllColumns,
  scene,
  scrollColumn,
  verticalOffset,
  viewport,
}: {
  columns: readonly WorkspaceColumn[];
  geometry: ColumnGeometry;
  planeGeometry: PlaneGeometry;
  renderAllColumns: boolean;
  scene: Pick<WorkspaceScene, "padding" | "renderOverscanColumns" | "visibleColumnCount">;
  scrollColumn: number;
  verticalOffset: number;
  viewport: LayoutFrameInput["viewport"];
}): number[] {
  if (renderAllColumns) {
    return columns.map((column) => column.index);
  }
  const overscanColumns = Math.max(0, Math.floor(scene.renderOverscanColumns));
  const visiblePlaneIndexes = visiblePlaneIndexesForLayout(
    columns,
    planeGeometry,
    verticalOffset,
    viewport.height,
  );
  if (overscanColumns === 0) {
    return renderedColumnIndexesWithoutOverscan({
      columns,
      geometry,
      scene,
      visibleColumnCountLimit: scene.visibleColumnCount,
      visiblePlaneIndexes,
      scrollColumn,
      viewportWidth: viewport.width,
    });
  }
  return renderedColumnIndexesWithOverscan({
    columns,
    geometry,
    overscanColumns,
    scene,
    scrollColumn,
    visiblePlaneIndexes,
    viewportWidth: viewport.width,
  });
}

export function columnsByIndexes(
  columns: readonly WorkspaceColumn[],
  indexes: readonly number[],
): WorkspaceColumn[] {
  const result: WorkspaceColumn[] = [];
  for (const index of indexes) {
    const column = columns[index];
    if (column) {
      result.push(column);
    }
  }
  return result;
}

function visiblePlaneIndexesForLayout(
  columns: readonly WorkspaceColumn[],
  planeGeometry: PlaneGeometry,
  verticalOffset: number,
  viewportHeight: number,
): number[] {
  const indexes = planeIndexes(columns);
  const overscanPlanes = 1;
  const visibleOrders = new Set<number>();
  for (let order = 0; order < indexes.length; order += 1) {
    const planeIndex = indexes[order];
    if (planeIndex === undefined) {
      continue;
    }
    const y = (planeGeometry.offsets.get(planeIndex) ?? 0) - verticalOffset;
    const planeHeight = planeGeometry.heights.get(planeIndex) ?? Math.max(1, viewportHeight);
    if (y + planeHeight < 0 || y > viewportHeight) {
      continue;
    }
    for (let offset = -overscanPlanes; offset <= overscanPlanes; offset += 1) {
      visibleOrders.add(clamp(order + offset, 0, indexes.length - 1));
    }
  }
  if (visibleOrders.size === 0) {
    visibleOrders.add(0);
  }
  return [...visibleOrders]
    .sort((left, right) => left - right)
    .map((order) => indexes[order])
    .filter((planeIndex): planeIndex is number => planeIndex !== undefined);
}

function renderedColumnIndexesWithoutOverscan({
  columns,
  geometry,
  scene,
  scrollColumn,
  visibleColumnCountLimit,
  visiblePlaneIndexes,
  viewportWidth,
}: {
  columns: readonly WorkspaceColumn[];
  geometry: ColumnGeometry;
  scene: Pick<WorkspaceScene, "padding">;
  scrollColumn: number;
  visibleColumnCountLimit: number;
  visiblePlaneIndexes: readonly number[];
  viewportWidth: number;
}): number[] {
  const renderedColumnIndexes = new Set<number>();
  const scrollOffset = scrollOffsetForColumn(scrollColumn, geometry.scrollOffsets);
  for (const planeIndex of visiblePlaneIndexes) {
    const planeColumns = columnsInPlane(columns, planeIndex);
    let addedColumnCount = 0;
    for (const column of planeColumns) {
      if (!columnIntersectsViewport(column, geometry, scene, scrollOffset, viewportWidth)) {
        continue;
      }
      addColumnIndex(renderedColumnIndexes, column);
      addedColumnCount += 1;
      if (addedColumnCount >= visibleColumnCountLimit) {
        break;
      }
    }
    if (addedColumnCount > 0) {
      continue;
    }
    const fallbackColumnIndex = nearestPlaneColumnIndexForScrollOffset(
      planeColumns,
      geometry,
      scrollOffset,
    );
    for (
      let index = fallbackColumnIndex;
      index < Math.min(planeColumns.length, fallbackColumnIndex + visibleColumnCountLimit);
      index += 1
    ) {
      addColumnIndex(renderedColumnIndexes, planeColumns[index]);
    }
  }
  return sortedColumnIndexes(renderedColumnIndexes);
}

function renderedColumnIndexesWithOverscan({
  columns,
  geometry,
  overscanColumns,
  scene,
  scrollColumn,
  visiblePlaneIndexes,
  viewportWidth,
}: {
  columns: readonly WorkspaceColumn[];
  geometry: ColumnGeometry;
  overscanColumns: number;
  scene: Pick<WorkspaceScene, "padding">;
  scrollColumn: number;
  visiblePlaneIndexes: readonly number[];
  viewportWidth: number;
}): number[] {
  const renderedColumnIndexes = new Set<number>();
  for (const planeIndex of visiblePlaneIndexes) {
    const planeColumns = columnsInPlane(columns, planeIndex);
    const range = visibleColumnRangeForPlane({
      geometry,
      planeColumns,
      scene,
      scrollColumn,
      viewportWidth,
    });
    const firstRenderedColumn = Math.max(0, range.first - overscanColumns);
    const lastRenderedColumn = Math.min(planeColumns.length - 1, range.last + overscanColumns);
    for (let index = firstRenderedColumn; index <= lastRenderedColumn; index += 1) {
      addColumnIndex(renderedColumnIndexes, planeColumns[index]);
    }
  }
  return sortedColumnIndexes(renderedColumnIndexes);
}

function visibleColumnRangeForPlane({
  geometry,
  planeColumns,
  scene,
  scrollColumn,
  viewportWidth,
}: {
  geometry: ColumnGeometry;
  planeColumns: readonly WorkspaceColumn[];
  scene: Pick<WorkspaceScene, "padding">;
  scrollColumn: number;
  viewportWidth: number;
}): { first: number; last: number } {
  const scrollOffset = scrollOffsetForColumn(scrollColumn, geometry.scrollOffsets);
  let first = planeColumns.length;
  let last = -1;
  for (let planeColumnIndex = 0; planeColumnIndex < planeColumns.length; planeColumnIndex += 1) {
    const column = planeColumns[planeColumnIndex];
    if (column && columnIntersectsViewport(column, geometry, scene, scrollOffset, viewportWidth)) {
      first = Math.min(first, planeColumnIndex);
      last = Math.max(last, planeColumnIndex);
    }
  }
  if (last >= 0) {
    return { first, last };
  }
  const fallbackColumn = nearestPlaneColumnIndexForScrollOffset(
    planeColumns,
    geometry,
    scrollOffset,
  );
  return { first: fallbackColumn, last: fallbackColumn };
}

function columnIntersectsViewport(
  column: WorkspaceColumn,
  geometry: ColumnGeometry,
  scene: Pick<WorkspaceScene, "padding">,
  scrollOffset: number,
  viewportWidth: number,
): boolean {
  const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
  const x = scene.padding + (geometry.offsets[column.index] ?? 0) - scrollOffset;
  return x + columnWidth >= 0 && x <= viewportWidth;
}

function columnsInPlane(
  columns: readonly WorkspaceColumn[],
  planeIndex: number,
): WorkspaceColumn[] {
  return columns.filter((column) => column.planeIndex === planeIndex);
}

function nearestPlaneColumnIndexForScrollOffset(
  planeColumns: readonly WorkspaceColumn[],
  geometry: ColumnGeometry,
  scrollOffset: number,
): number {
  let nearestColumnIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < planeColumns.length; index += 1) {
    const column = planeColumns[index];
    if (!column) {
      continue;
    }
    const distance = Math.abs((geometry.offsets[column.index] ?? 0) - scrollOffset);
    if (distance < nearestDistance) {
      nearestColumnIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestColumnIndex;
}

function planeIndexes(columns: readonly WorkspaceColumn[]): number[] {
  return [...new Set(columns.map((column) => column.planeIndex))].sort(
    (left, right) => left - right,
  );
}

function addColumnIndex(target: Set<number>, column: WorkspaceColumn | undefined): void {
  if (column) {
    target.add(column.index);
  }
}

function sortedColumnIndexes(indexes: ReadonlySet<number>): number[] {
  return [...indexes].sort((left, right) => left - right);
}
