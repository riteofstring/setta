import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";

type LiveDictAreaPixiFontFaceSet = Pick<
  FontFaceSet,
  "addEventListener" | "ready" | "removeEventListener" | "status"
>;

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

export function subscribeToLiveDictAreaPixiFontLoadInvalidation({
  fontFaceSet,
  onInvalidate,
}: {
  fontFaceSet: LiveDictAreaPixiFontFaceSet | null | undefined;
  onInvalidate: () => void;
}) {
  if (!fontFaceSet) {
    return () => {};
  }

  let disposed = false;
  const invalidateIfActive = () => {
    if (!disposed) {
      onInvalidate();
    }
  };

  const handleLoadingDone = () => {
    invalidateIfActive();
  };
  const handleLoadingError = () => {
    invalidateIfActive();
  };

  fontFaceSet.addEventListener("loadingdone", handleLoadingDone);
  fontFaceSet.addEventListener("loadingerror", handleLoadingError);

  if (fontFaceSet.status === "loading") {
    void fontFaceSet.ready.then(invalidateIfActive, invalidateIfActive);
  }

  return () => {
    disposed = true;
    fontFaceSet.removeEventListener("loadingdone", handleLoadingDone);
    fontFaceSet.removeEventListener("loadingerror", handleLoadingError);
  };
}
