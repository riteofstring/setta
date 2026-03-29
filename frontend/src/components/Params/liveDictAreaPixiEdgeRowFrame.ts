import {
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiEdgePortLayout,
  type LiveDictAreaPixiEdgeStripLayout,
} from "./liveDictAreaPixiLayout";

export const LIVE_DICT_AREA_PIXI_EDGE_STRIP_DIVIDER_WIDTH_PX = 12;
export const LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_X_PX = 4;
export const LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_Y_PX = 2;
export const LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_RADIUS_PX = 2;

export type LiveDictAreaPixiEdgeRowFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export function getLiveDictAreaPixiEdgeRowFrame({
  block,
  port,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  port: LiveDictAreaPixiEdgePortLayout;
}): LiveDictAreaPixiEdgeRowFrame {
  const columnWidth = Math.max(
    Math.floor(
      (block.width - LIVE_DICT_AREA_PIXI_EDGE_STRIP_DIVIDER_WIDTH_PX) / 2,
    ),
    0,
  );

  return {
    height: Math.max(
      LIVE_DICT_AREA_PIXI_LAYOUT.edgePortRowHeight -
        LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_Y_PX * 2,
      0,
    ),
    width: Math.max(
      columnWidth - LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_X_PX * 2,
      0,
    ),
    x:
      port.align === "left"
        ? block.x + LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_X_PX
        : block.x +
          block.width -
          columnWidth +
          LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_X_PX,
    y: port.y - LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_INSET_Y_PX,
  };
}
