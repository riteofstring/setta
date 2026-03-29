import type { LiveDictAreaMountProps } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { getLiveDictAreaPixiEdgeRowFrame } from "./liveDictAreaPixiEdgeRowFrame";
import {
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";

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

  return edgeStripBlock.inputPorts.flatMap((port) => {
    const inputPort = inputPortsById.get(port.id);
    if (!inputPort?.isSelectable) {
      return [];
    }

    const frame = getLiveDictAreaPixiEdgeRowFrame({
      block: edgeStripBlock,
      port,
    });

    return [
      {
        blockId: edgeStripBlock.blockId,
        height: frame.height,
        isSelected: port.isSelected,
        label: port.label,
        portId: port.id,
        sectionId: surfaceBlock.props.sectionId,
        width: frame.width,
        x: frame.x,
        y: frame.y,
      },
    ];
  });
}
