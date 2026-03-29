import type { LiveDictAreaMountProps } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";

type LiveDictAreaPixiDragRowSurfaceBlock = Extract<
  LiveDictAreaMountProps["liveDictAreaSurface"]["blocks"][number],
  {
    kind: "pinned-param-area" | "unpinned-param-area";
  }
>;

export type LiveDictAreaPixiDragRowTarget = {
  blockHeight: number;
  blockId: "pinned" | "unpinned";
  blockX: number;
  blockY: number;
  height: number;
  label: string;
  rowId: string;
  width: number;
  x: number;
  y: number;
};

export function buildLiveDictAreaPixiDragRowTargets({
  layout,
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: {
  layout?: LiveDictAreaPixiLayout | null;
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}): LiveDictAreaPixiDragRowTarget[] {
  const resolvedLayout =
    layout ??
    buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
    });
  const paramAreaBlocks = new Map<
    LiveDictAreaPixiDragRowSurfaceBlock["props"]["domPacket"]["visualPacket"]["blockId"],
    LiveDictAreaPixiDragRowSurfaceBlock
  >(
    liveDictAreaMountProps.liveDictAreaSurface.blocks.flatMap((block) =>
      block.kind === "pinned-param-area" || block.kind === "unpinned-param-area"
        ? [[block.props.domPacket.visualPacket.blockId, block] as const]
        : [],
    ),
  );

  return resolvedLayout.paramAreas.flatMap((paramArea) => {
    const surfaceBlock = paramAreaBlocks.get(paramArea.blockId);
    if (!surfaceBlock) {
      return [];
    }

    return paramArea.rows.flatMap((row) => {
      if (row.kind === "placeholder") {
        return [];
      }

      const requiredPath =
        surfaceBlock.props.domPacket.visualPacket.list.requiredParamIdsToPaths[
          row.id
        ];
      if (!requiredPath) {
        return [];
      }

      return [
        {
          blockHeight: paramArea.height,
          blockId: paramArea.blockId,
          blockX: paramArea.x,
          blockY: paramArea.y,
          height: row.blockHeight,
          label: row.labelText,
          rowId: row.id,
          width: Math.max(row.width - row.x, 0),
          x: row.x,
          y: row.y,
        },
      ];
    });
  });
}
