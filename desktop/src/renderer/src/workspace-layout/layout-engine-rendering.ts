import type {
  LayoutFrameInput,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  PaneId,
  PaneRenderItem,
} from "./types";
import {
  columnsByIndexes,
  type ColumnGeometry,
  minimumColumnWidth,
  overviewScale,
  type PaneLocation,
  planeTopOffsets,
  pushColumnItems,
  renderedColumnIndexesForLayout,
  scrollOffsetForColumn,
  totalUnscaledPlaneHeight,
} from "./layout-engine-helpers";

interface RenderFrameContext {
  availableHeight: number;
  columns: WorkspaceColumn[];
  geometry: ColumnGeometry;
  input: LayoutFrameInput;
  paneById: Map<PaneId, WorkspacePane>;
  planeIndexes: number[];
  push: (item: PaneRenderItem) => void;
  scene: WorkspaceScene;
}

export function renderNormalLayoutFrame({
  availableHeight,
  columns,
  focusedLocation,
  geometry,
  input,
  paneById,
  planeIndexes,
  push,
  scene,
}: RenderFrameContext & {
  focusedLocation: PaneLocation | null;
}): void {
  const focusedPlaneIndex = focusedLocation?.planeIndex ?? planeIndexes[0] ?? 0;
  const maximizedPaneId = input.maximizedPaneId;
  const scrollColumn = constrainScrollColumnToViewport(
    input.scrollColumn,
    focusedPlaneIndex,
    geometry,
    columns,
  );
  const verticalOffset = input.scrollRow;
  const planeOffsets = planeTopOffsets(planeIndexes, input.viewport.height);
  const normalPaneSpacing = {
    padding: scene.padding,
    rowGap: scene.rowGap,
  };
  const columnIndexes = renderedColumnIndexesForLayout({
    columns,
    geometry,
    renderAllColumns: input.renderAllColumns ?? false,
    scene,
    scrollColumn,
    verticalOffset,
    viewport: input.viewport,
  });

  for (const column of columnsByIndexes(columns, columnIndexes)) {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    const x =
      scene.padding +
      (geometry.offsets[column.index] ?? 0) -
      scrollOffsetForPlane(scrollColumn, geometry, column.planeIndex, columns);
    const planeTop = planeOffsets.get(column.planeIndex) ?? 0;
    pushColumnItems({
      availableHeight,
      column,
      columnWidth,
      focusedPaneId: input.focusedPaneId,
      maximizedPaneId,
      moving: input.movementPhase === "moving",
      paneById,
      presentationMode: input.presentationMode,
      push,
      scale: 1,
      scene: normalPaneSpacing,
      x,
      yOffset: planeTop - verticalOffset,
    });
  }
}

export function renderOverviewLayoutFrame({
  availableHeight,
  columns,
  geometry,
  input,
  paneById,
  planeIndexes,
  push,
  scene,
}: RenderFrameContext): void {
  const unscaledWidth = maxUnscaledPlaneWidth(columns, planeIndexes, geometry);
  const unscaledHeight = totalUnscaledPlaneHeight(planeIndexes.length, input.viewport.height);
  const scale = overviewScale(input.viewport, unscaledWidth, unscaledHeight, scene.padding);
  const xOffset = Math.max(
    scene.padding,
    Math.floor((input.viewport.width - unscaledWidth * scale) / 2),
  );
  const yOffset = Math.max(0, Math.floor((input.viewport.height - unscaledHeight * scale) / 2));
  const planeOffsets = planeTopOffsets(planeIndexes, input.viewport.height);

  for (const column of columns) {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    pushColumnItems({
      availableHeight,
      column,
      columnWidth,
      focusedPaneId: input.focusedPaneId,
      moving: input.movementPhase === "moving",
      paneById,
      presentationMode: input.presentationMode,
      push,
      scale,
      scene,
      x: xOffset + (geometry.offsets[column.index] ?? 0) * scale,
      yOffset: yOffset + (planeOffsets.get(column.planeIndex) ?? 0) * scale,
    });
  }
}

function constrainScrollColumnToViewport(
  scrollColumn: number,
  planeIndex: number,
  geometry: ColumnGeometry,
  columns: WorkspaceColumn[],
): number {
  const planeOffsets = offsetsForPlane(columns, planeIndex, geometry);
  return Math.max(0, Math.min(scrollColumn, Math.max(0, planeOffsets.length - 1)));
}

function maxUnscaledPlaneWidth(
  columns: WorkspaceColumn[],
  planeIndexes: number[],
  geometry: ColumnGeometry,
): number {
  return Math.max(
    minimumColumnWidth,
    ...planeIndexes.map((planeIndex) => totalUnscaledPlaneWidth(columns, planeIndex, geometry)),
  );
}

function offsetsForPlane(
  columns: WorkspaceColumn[],
  planeIndex: number,
  geometry: ColumnGeometry,
): number[] {
  return columns
    .filter((column) => column.planeIndex === planeIndex)
    .map((column) => geometry.offsets[column.index] ?? 0);
}

function scrollOffsetForPlane(
  scrollColumn: number,
  geometry: ColumnGeometry,
  planeIndex: number,
  columns: WorkspaceColumn[],
): number {
  return scrollOffsetForColumn(scrollColumn, offsetsForPlane(columns, planeIndex, geometry));
}

function totalUnscaledPlaneWidth(
  columns: WorkspaceColumn[],
  planeIndex: number,
  geometry: ColumnGeometry,
): number {
  const lastColumn = columns.filter((column) => column.planeIndex === planeIndex).at(-1);
  if (!lastColumn) {
    return minimumColumnWidth;
  }
  return (
    (geometry.offsets[lastColumn.index] ?? 0) +
    (geometry.widths[lastColumn.index] ?? minimumColumnWidth)
  );
}
