import type { LiveDictAreaMountProps } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";

const LIVE_DICT_AREA_PIXI_EDGE_STRIP_DIVIDER_WIDTH_PX = 12;
const LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_X = 4;
const LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_Y = 2;

type LiveDictAreaPixiEdgeStripSurfaceBlock = Extract<
  LiveDictAreaMountProps["liveDictAreaSurface"]["blocks"][number],
  {
    kind: "edge-strip";
  }
>;

export type LiveDictAreaPixiEdgeRowTarget = {
  blockId: "edges";
  height: number;
  isSelected: boolean;
  label: string;
  portId: string;
  sectionId: string;
  width: number;
  x: number;
  y: number;
};

export function buildLiveDictAreaPixiEdgeRowTargets({
  layout,
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: {
  layout?: LiveDictAreaPixiLayout | null;
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}): LiveDictAreaPixiEdgeRowTarget[] {
  const resolvedLayout =
    layout ??
    buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
    });
  const edgeStripBlock = resolvedLayout.edgeStrip;
  const surfaceBlock = liveDictAreaMountProps.liveDictAreaSurface.blocks.find(
    (block): block is LiveDictAreaPixiEdgeStripSurfaceBlock =>
      block.kind === "edge-strip",
  );

  if (!edgeStripBlock || !surfaceBlock) {
    return [];
  }

  const inputPortsById = new Map(
    surfaceBlock.props.domPacket.visualPacket.inputColumn.ports.map((port) => [
      port.id,
      port,
    ]),
  );
  const width = Math.max(
    Math.floor(
      (edgeStripBlock.width - LIVE_DICT_AREA_PIXI_EDGE_STRIP_DIVIDER_WIDTH_PX) /
        2,
    ) -
      LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_X * 2,
    0,
  );
  const height = Math.max(
    LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight -
      LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_Y * 2,
    0,
  );

  return edgeStripBlock.inputPorts.flatMap((port) => {
    const inputPort = inputPortsById.get(port.id);
    if (!inputPort?.isSelectable) {
      return [];
    }

    return [
      {
        blockId: edgeStripBlock.blockId,
        height,
        isSelected: port.isSelected,
        label: port.label,
        portId: port.id,
        sectionId: surfaceBlock.props.sectionId,
        width,
        x: edgeStripBlock.x + LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_X,
        y: port.y - LIVE_DICT_AREA_PIXI_EDGE_ROW_TARGET_INSET_Y,
      },
    ];
  });
}
