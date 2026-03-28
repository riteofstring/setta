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

export type LiveDictAreaPixiRowLayout = ParamSceneRowPacket & {
  blockHeight: number;
  kindTag: "Group" | "Placeholder" | null;
  labelText: string;
  labelX: number;
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
};

export type LiveDictAreaPixiFixedMeasurement = {
  blockId: LiveDictAreaPixiLayout["blocks"][number]["blockId"];
  height: number;
};

export function buildLiveDictAreaPixiLayout({
  liveDictAreaSceneBoundary,
  width,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  width: number;
}): LiveDictAreaPixiLayout {
  const canvasWidth = Math.max(
    Math.floor(width),
    LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
  );
  const blocks: LiveDictAreaPixiLayout["blocks"] = [];
  const paramAreas: LiveDictAreaPixiParamAreaLayout[] = [];
  const edgeStripState =
    liveDictAreaSceneBoundary.liveDictAreaBoundary.nodeScenePacket.edgeStrip;
  let edgeStrip: LiveDictAreaPixiEdgeStripLayout | null = null;
  let nextBlockY = LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetY;

  for (const block of liveDictAreaSceneBoundary.blocks) {
    if (block.kind === "edge-strip") {
      const edgeStripLayout = buildLiveDictAreaPixiEdgeStripLayout({
        block,
        canvasWidth,
        edgeStripState,
        y: nextBlockY,
      });
      blocks.push(edgeStripLayout);
      edgeStrip = edgeStripLayout;
      nextBlockY += edgeStripLayout.height + LIVE_DICT_AREA_PIXI_LAYOUT.areaGap;
      continue;
    }

    const paramAreaLayout = buildLiveDictAreaPixiParamAreaLayout({
      block,
      canvasWidth,
      y: nextBlockY,
    });
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
      (rowCount, paramArea) => rowCount + paramArea.rowCount,
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
  y,
}: {
  block: LiveDictAreaSceneBoundary["edgeStripBlock"];
  canvasWidth: number;
  edgeStripState: LiveDictAreaSceneBoundary["liveDictAreaBoundary"]["nodeScenePacket"]["edgeStrip"];
  y: number;
}): LiveDictAreaPixiEdgeStripLayout {
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
  const height = Math.max(
    block.estimatedHeight,
    LIVE_DICT_AREA_PIXI_LAYOUT.edgeMinHeight +
      rowCount * LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight,
  );

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
  y,
}: {
  block:
    | NonNullable<LiveDictAreaSceneBoundary["pinnedParamAreaBlock"]>
    | NonNullable<LiveDictAreaSceneBoundary["unpinnedParamAreaBlock"]>;
  canvasWidth: number;
  y: number;
}): LiveDictAreaPixiParamAreaLayout {
  const width = canvasWidth - LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX * 2;
  const rowsStartY =
    y +
    LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
    LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop;
  const rows = block.rows.map((row, rowIndex) =>
    buildLiveDictAreaPixiRowLayout({
      row,
      rowIndex,
      width,
      y: rowsStartY,
    }),
  );
  const contentHeight =
    LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
    LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop +
    rows.length * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight +
    LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom;
  const height =
    block.shouldApplyMinHeight && block.minHeight !== null
      ? Math.max(contentHeight, block.minHeight)
      : contentHeight;

  return {
    blockId: block.blockId,
    headerHeight: LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight,
    height,
    kind: block.kind,
    mountKind: block.mount.mountKind,
    rowCount: block.rowCount,
    rows,
    title: block.title,
    width,
    x: LIVE_DICT_AREA_PIXI_LAYOUT.sectionInsetX,
    y,
  };
}

function buildLiveDictAreaPixiRowLayout({
  row,
  rowIndex,
  width,
  y,
}: {
  row: ParamSceneRowPacket;
  rowIndex: number;
  width: number;
  y: number;
}): LiveDictAreaPixiRowLayout {
  const x =
    LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX +
    row.depth * LIVE_DICT_AREA_PIXI_LAYOUT.rowIndent;

  return {
    ...row,
    blockHeight: LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight - 4,
    kindTag:
      row.kind === "group"
        ? "Group"
        : row.kind === "placeholder"
          ? "Placeholder"
          : null,
    labelText: row.label ?? "Placeholder",
    labelX: x + LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX * 2,
    width,
    x,
    y:
      y +
      rowIndex * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight +
      LIVE_DICT_AREA_PIXI_LAYOUT.rowTopOffset,
  };
}
