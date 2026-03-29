import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

export const LIVE_DICT_AREA_PIXI_LAYOUT = {
  areaGap: 8,
  areaHeaderHeight: 28,
  areaPaddingBottom: 8,
  areaPaddingTop: 6,
  canvasMinWidth: 320,
  edgeColumnInsetX: 12,
  edgeHeaderHeight: 28,
  edgeMinHeight: 40,
  edgePortRowHeight: 20,
  panelRadius: 12,
  rowHeight: 22,
  rowIndent: 12,
  rowInsetX: 10,
  rowTopOffset: 4,
  sectionInsetX: 0,
  sectionInsetY: 0,
  titleInsetX: 12,
} as const;

export const LIVE_DICT_AREA_PIXI_PARAM_AREA_CONTENT_RIGHT_PADDING_PX = 6;

const LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT = {
  areaPaddingBottom: 2,
  areaPaddingTop: 2,
  rowTopOffset: 2,
} as const;
const LIVE_DICT_AREA_PIXI_COMPACT_READABLE_PREVIEW_ROW_COUNT = 2;

export const LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT =
  LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight - 4;

export const LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT =
  getLiveDictAreaPixiCompactPreviewMinHeight(1);

const LIVE_DICT_AREA_PIXI_REGULAR_SINGLE_ROW_MIN_HEIGHT =
  LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
  LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop +
  LIVE_DICT_AREA_PIXI_LAYOUT.rowTopOffset +
  LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT +
  LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom;

export type LiveDictAreaPixiRowLayout = ParamSceneRowPacket & {
  blockHeight: number;
  labelText: string;
  labelX: number;
  valueText: string | null;
  width: number;
  x: number;
  y: number;
};

export type LiveDictAreaPixiParamAreaLayout = {
  blockId: "pinned" | "unpinned";
  headerHeight: number;
  height: number;
  kind: "pinned-param-area" | "unpinned-param-area";
  mountKind: "fixed" | "grow";
  rowCount: number;
  rows: LiveDictAreaPixiRowLayout[];
  title: string;
  width: number;
  x: number;
  y: number;
};

export type LiveDictAreaPixiEdgePortLayout = {
  align: "left" | "right";
  id: string;
  isSelected: boolean;
  label: string;
  side: "in" | "out";
  x: number;
  y: number;
};

export type LiveDictAreaPixiEdgeStripLayout = {
  blockId: "edges";
  height: number;
  inputPorts: LiveDictAreaPixiEdgePortLayout[];
  kind: "edge-strip";
  mountKind: "fixed";
  outputPorts: LiveDictAreaPixiEdgePortLayout[];
  portRowCount: number;
  title: string;
  width: number;
  x: number;
  y: number;
};

export type LiveDictAreaPixiLayout = {
  blocks: Array<
    LiveDictAreaPixiEdgeStripLayout | LiveDictAreaPixiParamAreaLayout
  >;
  canvasHeight: number;
  canvasWidth: number;
  edgeStrip: LiveDictAreaPixiEdgeStripLayout | null;
  paramAreas: LiveDictAreaPixiParamAreaLayout[];
  totalRowCount: number;
  valuePreviewCount: number;
};

export type LiveDictAreaPixiFixedMeasurement = {
  blockId: LiveDictAreaPixiLayout["blocks"][number]["blockId"];
  height: number;
};

export function buildLiveDictAreaPixiLayout({
  liveDictAreaSceneBoundary,
  maxCanvasHeight,
  width,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  maxCanvasHeight?: number | null;
  width: number;
}): LiveDictAreaPixiLayout {
  const canvasWidth = Math.max(
    Math.floor(width),
    LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
  );
  const blocks: LiveDictAreaPixiLayout["blocks"] = [];
  const paramAreas: LiveDictAreaPixiParamAreaLayout[] = [];
  const normalizedMaxCanvasHeight =
    typeof maxCanvasHeight === "number" &&
    Number.isFinite(maxCanvasHeight) &&
    maxCanvasHeight > 0
      ? Math.floor(maxCanvasHeight)
      : null;
  const edgeStripState =
    liveDictAreaSceneBoundary.liveDictAreaBoundary.nodeScenePacket.edgeStrip;
  let edgeStrip: LiveDictAreaPixiEdgeStripLayout | null = null;
  let nextBlockY = LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetY;

  for (const [
    blockIndex,
    block,
  ] of liveDictAreaSceneBoundary.blocks.entries()) {
    const remainingCanvasHeight =
      normalizedMaxCanvasHeight === null
        ? null
        : normalizedMaxCanvasHeight - nextBlockY;
    if (remainingCanvasHeight !== null && remainingCanvasHeight <= 0) {
      break;
    }

    if (block.kind === "edge-strip") {
      const edgeStripLayout = buildLiveDictAreaPixiEdgeStripLayout({
        block,
        canvasWidth,
        edgeStripState,
        maxHeight:
          remainingCanvasHeight === null
            ? null
            : remainingCanvasHeight -
              getLiveDictAreaPixiReservedTrailingPreviewHeight({
                blockIndex,
                blocks: liveDictAreaSceneBoundary.blocks,
              }),
        y: nextBlockY,
      });
      if (!edgeStripLayout) {
        continue;
      }
      blocks.push(edgeStripLayout);
      edgeStrip = edgeStripLayout;
      nextBlockY += edgeStripLayout.height + LIVE_DICT_AREA_PIXI_LAYOUT.areaGap;
      continue;
    }

    const paramAreaLayout = buildLiveDictAreaPixiParamAreaLayout({
      block,
      canvasWidth,
      maxHeight: remainingCanvasHeight,
      y: nextBlockY,
    });
    if (!paramAreaLayout) {
      continue;
    }
    blocks.push(paramAreaLayout);
    paramAreas.push(paramAreaLayout);
    nextBlockY += paramAreaLayout.height + LIVE_DICT_AREA_PIXI_LAYOUT.areaGap;
  }

  const canvasHeight =
    blocks.length === 0 ? 0 : nextBlockY - LIVE_DICT_AREA_PIXI_LAYOUT.areaGap;

  return {
    blocks,
    canvasHeight,
    canvasWidth,
    edgeStrip,
    paramAreas,
    totalRowCount: paramAreas.reduce(
      (rowCount, paramArea) => rowCount + paramArea.rows.length,
      0,
    ),
    valuePreviewCount: paramAreas.reduce(
      (valuePreviewCount, paramArea) =>
        valuePreviewCount +
        paramArea.rows.filter((row) => row.valueText !== null).length,
      0,
    ),
  };
}

export function buildLiveDictAreaPixiFixedMeasurements({
  liveDictAreaSceneBoundary,
  width = LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  width?: number;
}): LiveDictAreaPixiFixedMeasurement[] {
  return buildLiveDictAreaPixiLayout({
    liveDictAreaSceneBoundary,
    width,
  })
    .blocks.filter((block) => block.mountKind === "fixed")
    .map((block) => ({
      blockId: block.blockId,
      height: block.height,
    }));
}

function buildLiveDictAreaPixiEdgeStripLayout({
  block,
  canvasWidth,
  edgeStripState,
  maxHeight,
  y,
}: {
  block: LiveDictAreaSceneBoundary["edgeStripBlock"];
  canvasWidth: number;
  edgeStripState: LiveDictAreaSceneBoundary["liveDictAreaBoundary"]["nodeScenePacket"]["edgeStrip"];
  maxHeight: number | null;
  y: number;
}): LiveDictAreaPixiEdgeStripLayout | null {
  if (!block) {
    throw new Error(
      "Expected live edge-strip renderer packet for Pixi layout.",
    );
  }

  const width = canvasWidth - LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX * 2;
  const rowCount = Math.max(
    edgeStripState.inputPortCount,
    edgeStripState.outputPortCount,
    block.portRowCount,
  );
  const rowsStartY = y + LIVE_DICT_AREA_PIXI_LAYOUT.edgeHeaderHeight + 4;
  const unclampedHeight = Math.max(
    block.estimatedHeight,
    LIVE_DICT_AREA_PIXI_LAYOUT.edgeMinHeight +
      rowCount * LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight,
  );
  const normalizedMaxHeight =
    typeof maxHeight === "number" && Number.isFinite(maxHeight) && maxHeight > 0
      ? Math.floor(maxHeight)
      : null;
  const height =
    normalizedMaxHeight === null
      ? unclampedHeight
      : Math.min(unclampedHeight, normalizedMaxHeight);
  if (height <= 0) {
    return null;
  }

  return {
    blockId: block.blockId,
    height,
    inputPorts: edgeStripState.inputPorts.map((port, index) => ({
      align: "left",
      id: port.id,
      isSelected: edgeStripState.selectedParamIds.includes(port.id),
      label: port.label,
      side: "in",
      x: LIVE_DICT_AREA_PIXI_LAYOUT.edgeColumnInsetX,
      y: rowsStartY + index * LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight,
    })),
    kind: "edge-strip",
    mountKind: block.mount.mountKind,
    outputPorts: edgeStripState.outputPorts.map((port, index) => ({
      align: "right",
      id: port.id,
      isSelected: false,
      label: port.label,
      side: "out",
      x: width - LIVE_DICT_AREA_PIXI_LAYOUT.edgeColumnInsetX,
      y: rowsStartY + index * LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight,
    })),
    portRowCount: rowCount,
    title: block.title,
    width,
    x: LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX,
    y,
  };
}

function buildLiveDictAreaPixiParamAreaLayout({
  block,
  canvasWidth,
  maxHeight,
  y,
}: {
  block:
    | NonNullable<LiveDictAreaSceneBoundary["pinnedParamAreaBlock"]>
    | NonNullable<LiveDictAreaSceneBoundary["unpinnedParamAreaBlock"]>;
  canvasWidth: number;
  maxHeight: number | null;
  y: number;
}): LiveDictAreaPixiParamAreaLayout | null {
  const width = canvasWidth - LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX * 2;
  const normalizedMaxHeight =
    typeof maxHeight === "number" && Number.isFinite(maxHeight) && maxHeight > 0
      ? Math.floor(maxHeight)
      : null;
  const usesCompactPreview =
    normalizedMaxHeight !== null &&
    normalizedMaxHeight < LIVE_DICT_AREA_PIXI_REGULAR_SINGLE_ROW_MIN_HEIGHT;
  const headerHeight =
    usesCompactPreview || block.kind === "unpinned-param-area"
      ? 0
      : LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight;
  const reservedHeaderHeight = usesCompactPreview
    ? 0
    : LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight;
  const areaPaddingTop = usesCompactPreview
    ? LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.areaPaddingTop
    : LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop;
  const areaPaddingBottom = usesCompactPreview
    ? LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.areaPaddingBottom
    : LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom;
  const rowTopOffset = usesCompactPreview
    ? LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.rowTopOffset
    : LIVE_DICT_AREA_PIXI_LAYOUT.rowTopOffset;
  const rowsStartY = y + headerHeight + areaPaddingTop;
  const rows = block.rows.map((row, rowIndex) =>
    buildLiveDictAreaPixiRowLayout({
      row,
      rowIndex,
      rowTopOffset,
      width,
      y: rowsStartY,
    }),
  );
  const contentHeight =
    reservedHeaderHeight +
    areaPaddingTop +
    rows.length * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight +
    areaPaddingBottom;
  const unclampedHeight =
    block.shouldApplyMinHeight && block.minHeight !== null
      ? Math.max(contentHeight, block.minHeight)
      : contentHeight;
  const height =
    normalizedMaxHeight === null
      ? unclampedHeight
      : Math.min(unclampedHeight, normalizedMaxHeight);
  if (height <= 0) {
    return null;
  }
  const visibleRowsBottomY = y + height - areaPaddingBottom;
  const visibleRows = rows.filter(
    (row) => row.y + row.blockHeight <= visibleRowsBottomY,
  );
  if (visibleRows.length === 0) {
    return null;
  }

  return {
    blockId: block.blockId,
    headerHeight,
    height,
    kind: block.kind,
    mountKind: block.mount.mountKind,
    rowCount: block.rowCount,
    rows: visibleRows,
    title: block.title,
    width,
    x: LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX,
    y,
  };
}

function getLiveDictAreaPixiReservedTrailingPreviewHeight({
  blockIndex,
  blocks,
}: {
  blockIndex: number;
  blocks: LiveDictAreaSceneBoundary["blocks"];
}) {
  const trailingParamArea = blocks
    .slice(blockIndex + 1)
    .find(
      (block) =>
        (block.kind === "pinned-param-area" ||
          block.kind === "unpinned-param-area") &&
        block.rowCount > 0,
    );

  if (!trailingParamArea) {
    return 0;
  }

  return (
    LIVE_DICT_AREA_PIXI_LAYOUT.areaGap +
    getLiveDictAreaPixiCompactPreviewMinHeight(
      Math.min(
        trailingParamArea.rowCount,
        LIVE_DICT_AREA_PIXI_COMPACT_READABLE_PREVIEW_ROW_COUNT,
      ),
    )
  );
}

function getLiveDictAreaPixiCompactPreviewMinHeight(visibleRowCount: number) {
  if (visibleRowCount <= 0) {
    return 0;
  }

  return (
    LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.areaPaddingTop +
    LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.rowTopOffset +
    LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT +
    (visibleRowCount - 1) * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight +
    LIVE_DICT_AREA_PIXI_COMPACT_PREVIEW_LAYOUT.areaPaddingBottom
  );
}

function buildLiveDictAreaPixiRowLayout({
  row,
  rowIndex,
  rowTopOffset,
  width,
  y,
}: {
  row: ParamSceneRowPacket;
  rowIndex: number;
  rowTopOffset: number;
  width: number;
  y: number;
}): LiveDictAreaPixiRowLayout {
  const x =
    LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX +
    row.depth * LIVE_DICT_AREA_PIXI_LAYOUT.rowIndent;

  return {
    ...row,
    blockHeight: LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT,
    labelText: row.label ?? "Placeholder",
    labelX: x + LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX * 2,
    valueText: row.kind === "value" ? row.valuePreview : null,
    width,
    x,
    y: y + rowIndex * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight + rowTopOffset,
  };
}
