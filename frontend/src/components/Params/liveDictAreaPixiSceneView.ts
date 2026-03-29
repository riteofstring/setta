import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";

export function getLiveDictAreaPixiLogicalCanvasWidth(hostWidth: number) {
  const safeHostWidth =
    Number.isFinite(hostWidth) && hostWidth > 0 ? Math.floor(hostWidth) : 0;

  return Math.max(safeHostWidth, LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth);
}

export function getLiveDictAreaPixiRenderResolution({
  devicePixelRatio,
  viewportZoom,
}: {
  devicePixelRatio: number;
  viewportZoom: number;
}) {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const safeViewportZoom =
    Number.isFinite(viewportZoom) && viewportZoom > 0 ? viewportZoom : 1;

  return safeDevicePixelRatio * safeViewportZoom;
}
