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
  type OverviewCardSizeConstraints,
  planeGeometryForLayout,
  pushColumnItems,
  renderedColumnIndexesForLayout,
  scrollOffsetForColumn,
} from "./layout-engine-helpers";

interface RenderFrameContext {
  availableHeight: number;
  columns: WorkspaceColumn[];
  fullSizePanes: boolean;
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
  fullSizePanes,
  geometry,
  input,
  paneById,
  planeIndexes,
  push,
  scene,
}: RenderFrameContext): void {
  const maximizedPaneId = input.maximizedPaneId;
  const scrollColumn = constrainScrollColumnToViewport(input.scrollColumn, geometry);
  const verticalOffset = input.scrollRow;
  const horizontalPanOffset = scrollOffsetForColumn(scrollColumn, geometry.scrollOffsets);
  const normalPaneSpacing = {
    padding: scene.padding,
    rowGap: scene.rowGap,
  };
  const planeGeometry = planeGeometryForLayout({
    availableHeight,
    columns,
    fullSizePanes,
    maximizedPaneId,
    padding: normalPaneSpacing.padding,
    paneById,
    planeGap: scene.columnGap,
    planeIndexes,
    rowGap: normalPaneSpacing.rowGap,
    viewportHeight: input.viewport.height,
  });
  const columnIndexes = renderedColumnIndexesForLayout({
    columns,
    geometry,
    planeGeometry,
    renderAllColumns: input.renderAllColumns ?? false,
    scene,
    scrollColumn,
    verticalOffset,
    viewport: input.viewport,
  });

  for (const column of columnsByIndexes(columns, columnIndexes)) {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    const x =
      input.viewport.x +
      scene.padding +
      (geometry.offsets[column.index] ?? 0) -
      horizontalPanOffset;
    const planeTop = planeGeometry.offsets.get(column.planeIndex) ?? 0;
    pushColumnItems({
      availableHeight,
      column,
      columnWidth,
      focusedPaneId: input.focusedPaneId,
      fullSizePanes,
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
  cardSizeConstraints,
  columns,
  fullSizePanes,
  geometry,
  input,
  paneById,
  planeIndexes,
  push,
  scene,
}: RenderFrameContext & {
  cardSizeConstraints?: OverviewCardSizeConstraints;
}): void {
  const maximizedPaneId = input.maximizedPaneId;
  const planeGeometry = planeGeometryForLayout({
    availableHeight,
    columns,
    fullSizePanes,
    maximizedPaneId,
    padding: scene.padding,
    paneById,
    planeGap: scene.columnGap,
    planeIndexes,
    rowGap: scene.rowGap,
    viewportHeight: input.viewport.height,
  });
  const unscaledWidth = maxUnscaledPlaneWidth(columns, planeIndexes, geometry);
  const unscaledHeight = planeGeometry.totalHeight;
  const referenceCardWidth = maxOverviewCardWidth(columns, geometry);
  const scale = overviewScale({
    cardSizeConstraints,
    height: unscaledHeight,
    padding: scene.padding,
    referenceCardWidth,
    viewport: input.viewport,
    width: unscaledWidth,
  });
  const xOffset = Math.max(
    input.viewport.x + scene.padding,
    input.viewport.x + Math.floor((input.viewport.width - unscaledWidth * scale) / 2),
  );
  const centeredYOffset = Math.max(
    0,
    Math.floor((input.viewport.height - unscaledHeight * scale) / 2),
  );
  const yOffset = centeredYOffset - input.scrollRow * scale;
  const horizontalPanOffset = scrollOffsetForColumn(input.scrollColumn, geometry.scrollOffsets);

  for (const column of columns) {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    pushColumnItems({
      availableHeight,
      column,
      columnWidth,
      focusedPaneId: input.focusedPaneId,
      fullSizePanes,
      maximizedPaneId,
      moving: input.movementPhase === "moving",
      paneById,
      presentationMode: input.presentationMode,
      push,
      scale,
      scene,
      x: xOffset + ((geometry.offsets[column.index] ?? 0) - horizontalPanOffset) * scale,
      yOffset: yOffset + (planeGeometry.offsets.get(column.planeIndex) ?? 0) * scale,
    });
  }
}

function constrainScrollColumnToViewport(scrollColumn: number, geometry: ColumnGeometry): number {
  return Math.max(0, Math.min(scrollColumn, Math.max(0, geometry.scrollOffsets.length - 1)));
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

function maxOverviewCardWidth(columns: WorkspaceColumn[], geometry: ColumnGeometry): number {
  return Math.max(
    minimumColumnWidth,
    ...columns.map((column) => geometry.widths[column.index] ?? minimumColumnWidth),
  );
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
