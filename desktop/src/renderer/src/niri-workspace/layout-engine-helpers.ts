import type {
  ColumnWidthSpec,
  LayoutFrameInput,
  NiriColumn,
  NiriWorkspaceScene,
  PaneId,
} from "./types";
import type { PaneVisualFrame } from "./pane-visual-frame";

export type PaneDirection = "up" | "down" | "left" | "right";
export type PaneLocation = {
  columnIndex: number;
  planeColumnIndex: number;
  planeIndex: number;
  rowIndex: number;
};
export type ColumnGeometry = { offsets: number[]; widths: number[] };

const columnWidthPresets = [1 / 3, 0.5, 2 / 3, 1] as const;
export const maximumOverviewScale = 0.42;
export const minimumColumnWidth = 96;
export const minimumOverviewScale = 0.12;
export const planeGap = 28;

interface RenderedColumnIndexesInput {
  columns: readonly NiriColumn[];
  geometry: ColumnGeometry;
  planeIndexes: readonly number[];
  renderAllColumns: boolean;
  scene: Pick<NiriWorkspaceScene, "padding" | "renderOverscanColumns" | "visibleColumnCount">;
  scrollColumn: number;
  verticalOffset: number;
  viewport: LayoutFrameInput["viewport"];
}

export function renderedColumnIndexesForFrame({
  columns,
  geometry,
  planeIndexes,
  renderAllColumns,
  scene,
  scrollColumn,
  verticalOffset,
  viewport,
}: RenderedColumnIndexesInput): number[] {
  if (renderAllColumns) {
    return columns.map((column) => column.index);
  }
  const overscanColumns = Math.max(0, Math.floor(scene.renderOverscanColumns));
  const visiblePlaneIndexes = visiblePlaneIndexesForFrame(
    planeIndexes,
    viewport.height,
    verticalOffset,
  );
  if (overscanColumns === 0) {
    return renderedColumnIndexesWithoutOverscan(
      columns,
      scene.visibleColumnCount,
      visiblePlaneIndexes,
      scrollColumn,
    );
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

function renderedColumnIndexesWithoutOverscan(
  columns: readonly NiriColumn[],
  visibleColumnCountLimit: number,
  visiblePlaneIndexes: readonly number[],
  scrollColumn: number,
): number[] {
  const renderedColumnIndexes = new Set<number>();
  for (const planeIndex of visiblePlaneIndexes) {
    const planeColumns = columnsInPlane(columns, planeIndex);
    const visibleColumnCount = Math.min(visibleColumnCountLimit, planeColumns.length);
    const startColumn = clamp(Math.floor(scrollColumn), 0, Math.max(0, planeColumns.length - 1));
    for (let offset = 0; offset < visibleColumnCount; offset += 1) {
      addColumnIndex(renderedColumnIndexes, planeColumns[startColumn + offset]);
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
  columns: readonly NiriColumn[];
  geometry: ColumnGeometry;
  overscanColumns: number;
  scene: Pick<NiriWorkspaceScene, "padding">;
  scrollColumn: number;
  visiblePlaneIndexes: readonly number[];
  viewportWidth: number;
}): number[] {
  const renderedColumnIndexes = new Set<number>();
  for (const planeIndex of visiblePlaneIndexes) {
    const planeColumns = columnsInPlane(columns, planeIndex);
    const range = visibleColumnRangeForPlane({
      columns,
      geometry,
      planeColumns,
      planeIndex,
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
  columns,
  geometry,
  planeColumns,
  planeIndex,
  scene,
  scrollColumn,
  viewportWidth,
}: {
  columns: readonly NiriColumn[];
  geometry: ColumnGeometry;
  planeColumns: readonly NiriColumn[];
  planeIndex: number;
  scene: Pick<NiriWorkspaceScene, "padding">;
  scrollColumn: number;
  viewportWidth: number;
}): { first: number; last: number } {
  const planeOffsets = offsetsForPlane(columns, planeIndex, geometry);
  const scrollOffset = scrollOffsetForColumn(scrollColumn, planeOffsets);
  let first = planeColumns.length;
  let last = -1;
  for (let planeColumnIndex = 0; planeColumnIndex < planeColumns.length; planeColumnIndex += 1) {
    const column = planeColumns[planeColumnIndex];
    if (
      column &&
      columnIntersectsViewport(column, geometry, scene.padding, scrollOffset, viewportWidth)
    ) {
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

function columnIntersectsViewport(
  column: NiriColumn,
  geometry: ColumnGeometry,
  padding: number,
  scrollOffset: number,
  viewportWidth: number,
): boolean {
  const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
  const x = padding + (geometry.offsets[column.index] ?? 0) - scrollOffset;
  return x + columnWidth >= 0 && x <= viewportWidth;
}

function visiblePlaneIndexesForFrame(
  planeIndexes: readonly number[],
  viewportHeight: number,
  verticalOffset: number,
): number[] {
  const planeOffsets = planeTopOffsets(planeIndexes, viewportHeight);
  const planeHeight = Math.max(1, viewportHeight);
  const overscanPlanes = 1;
  const visibleOrders = new Set<number>();
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

function columnsInPlane(columns: readonly NiriColumn[], planeIndex: number): NiriColumn[] {
  return columns.filter((column) => column.planeIndex === planeIndex);
}

export function offsetsForPlane(
  columns: readonly NiriColumn[],
  planeIndex: number,
  geometry: ColumnGeometry,
): number[] {
  return columnsInPlane(columns, planeIndex).map((column) => geometry.offsets[column.index] ?? 0);
}

export function planeTopOffsets(
  planeIndexes: readonly number[],
  viewportHeight: number,
): Map<number, number> {
  const offsets = new Map<number, number>();
  const planeHeight = Math.max(1, viewportHeight);
  planeIndexes.forEach((planeIndex, order) => {
    offsets.set(planeIndex, order * (planeHeight + planeGap));
  });
  return offsets;
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

export function scrollColumnForOffset(scrollOffset: number, offsets: readonly number[]): number {
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

export function clamp(value: number, min: number, max: number): number {
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

export function nearestColumnWidthPreset(value: number): number {
  let nearest = columnWidthPresets[0];
  for (const preset of columnWidthPresets) {
    if (Math.abs(preset - value) < Math.abs(nearest - value)) {
      nearest = preset;
    }
  }
  return nearest;
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

export function isHorizontalDirection(direction: PaneDirection): direction is "left" | "right" {
  return direction === "left" || direction === "right";
}

export function isVerticalDirection(direction: PaneDirection): direction is "up" | "down" {
  return direction === "up" || direction === "down";
}
