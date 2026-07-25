import type {
  LayoutFrameInput,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  PaneId,
  PaneRenderItem,
} from "./types";
import {
  applyOverviewZoom,
  clamp,
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

export interface OverviewLayoutMetrics {
  // Screen-pixel offset of the (edge-aligned / centered) content origin before
  // pan is subtracted. Exposed so the store can map a screen focal point to a
  // surface coordinate for zoom-to-cursor.
  baseXOffset: number;
  baseYOffset: number;
  contentHeight: number;
  contentWidth: number;
  // The fit-all baseline scale (before user zoom). The effective `scale` is
  // `applyOverviewZoom(fitScale, overviewZoom)`.
  fitScale: number;
  maxPanX: number;
  maxPanY: number;
  scale: number;
}

// The frozen overview frame transform. While a drop preview reflows the scene,
// the engine computes this from the committed columns and renders the preview
// pane offsets inside it, so the scale/centering/pan bounds stay put (the visible
// zoom never snaps and the drag's screen-space hit rects stay valid).
export interface OverviewFrameTransform {
  baseXOffset: number;
  baseYOffset: number;
  maxPanX: number;
  maxPanY: number;
  scale: number;
}

interface OverviewLayoutGeometry extends OverviewLayoutMetrics {
  planeGeometry: ReturnType<typeof planeGeometryForLayout>;
}

export interface OverviewLayoutContext {
  availableHeight: number;
  cardSizeConstraints?: OverviewCardSizeConstraints;
  columns: WorkspaceColumn[];
  fullSizePanes: boolean;
  geometry: ColumnGeometry;
  input: LayoutFrameInput;
  paneById: Map<PaneId, WorkspacePane>;
  planeIndexes: number[];
  scene: WorkspaceScene;
}

// Shared overview layout math used both to render and to compute pan bounds, so
// the clamp the store applies always matches what the renderer actually shows.
export function overviewLayoutMetrics(context: OverviewLayoutContext): OverviewLayoutMetrics {
  const {
    baseXOffset,
    baseYOffset,
    contentHeight,
    contentWidth,
    fitScale,
    maxPanX,
    maxPanY,
    scale,
  } = overviewLayoutGeometry(context);
  return {
    baseXOffset,
    baseYOffset,
    contentHeight,
    contentWidth,
    fitScale,
    maxPanX,
    maxPanY,
    scale,
  };
}

function overviewLayoutGeometry({
  availableHeight,
  cardSizeConstraints,
  columns,
  fullSizePanes,
  geometry,
  input,
  paneById,
  planeIndexes,
  scene,
}: OverviewLayoutContext): OverviewLayoutGeometry {
  const planeGeometry = planeGeometryForLayout({
    availableHeight,
    columns,
    fullSizePanes,
    maximizedPaneId: input.maximizedPaneId,
    padding: scene.padding,
    paneById,
    planeGap: scene.columnGap,
    planeIndexes,
    rowGap: scene.rowGap,
    viewportHeight: input.viewport.height,
  });
  const unscaledWidth = maxUnscaledPlaneWidth(columns, planeIndexes, geometry);
  const unscaledHeight = planeGeometry.totalHeight;
  const fitScale = overviewScale({
    cardSizeConstraints,
    height: unscaledHeight,
    padding: scene.padding,
    referenceCardWidth: maxOverviewCardWidth(columns, geometry),
    viewport: input.viewport,
    width: unscaledWidth,
  });
  const scale = applyOverviewZoom(fitScale, input.overviewZoom);
  const contentWidth = unscaledWidth * scale;
  const contentHeight = unscaledHeight * scale;
  const baseXOffset = Math.max(
    input.viewport.x + scene.padding,
    input.viewport.x + Math.floor((input.viewport.width - contentWidth) / 2),
  );
  const baseYOffset = Math.max(0, Math.floor((input.viewport.height - contentHeight) / 2));
  return {
    baseXOffset,
    baseYOffset,
    contentHeight,
    contentWidth,
    fitScale,
    // How far the surface can pan before the far edge of the content reaches the
    // opposite viewport edge. Zero when the content already fits.
    maxPanX: Math.max(
      0,
      baseXOffset - input.viewport.x + contentWidth - input.viewport.width + scene.padding,
    ),
    maxPanY: Math.max(0, baseYOffset + contentHeight - input.viewport.height + scene.padding),
    planeGeometry,
    scale,
  };
}

export function renderOverviewLayoutFrame(
  context: RenderFrameContext & {
    cardSizeConstraints?: OverviewCardSizeConstraints;
    frameOverride?: OverviewFrameTransform;
  },
): void {
  const {
    availableHeight,
    columns,
    frameOverride,
    fullSizePanes,
    geometry,
    input,
    paneById,
    push,
    scene,
  } = context;
  // Per-pane offsets always follow the current (possibly preview) columns; the
  // frame transform (scale/centering/pan bounds) uses the committed override when
  // a drop preview is active so the surface does not zoom or recenter mid-drag.
  const computed = overviewLayoutGeometry(context);
  const planeGeometry = computed.planeGeometry;
  const { baseXOffset, baseYOffset, maxPanX, maxPanY, scale } = frameOverride ?? computed;
  const panX = clamp(input.overviewPanX ?? 0, 0, maxPanX);
  const panY = clamp(input.overviewPanY ?? 0, 0, maxPanY);
  const xOffset = baseXOffset - panX;
  const yOffset = baseYOffset - input.scrollRow * scale - panY;
  const horizontalPanOffset = scrollOffsetForColumn(input.scrollColumn, geometry.scrollOffsets);

  for (const column of columns) {
    const columnWidth = geometry.widths[column.index] ?? minimumColumnWidth;
    pushColumnItems({
      availableHeight,
      column,
      columnWidth,
      focusedPaneId: input.focusedPaneId,
      fullSizePanes,
      maximizedPaneId: input.maximizedPaneId,
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
