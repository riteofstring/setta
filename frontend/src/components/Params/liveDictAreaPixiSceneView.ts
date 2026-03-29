import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";

export const LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY =
  "ui-sans-serif, system-ui, sans-serif";

export type LiveDictAreaPixiTextStyleSet = {
  edgeLabelFontSize: number;
  edgeLabelFontWeight: string;
  edgeRowFontSize: number;
  edgeRowFontWeight: string;
  rowFontSize: number;
  rowFontWeight: string;
  titleFontSize: number;
  titleFontWeight: string;
};

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

export function getLiveDictAreaPixiTextFontFamily({
  fallbackElement,
  getComputedStyle,
  host,
}: {
  fallbackElement?: Element | null;
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
  host?: Element | null;
}) {
  if (!getComputedStyle) {
    return LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY;
  }

  for (const element of [host, fallbackElement]) {
    if (!element) {
      continue;
    }

    const nextFontFamily = getComputedStyle(element).fontFamily.trim();
    if (nextFontFamily) {
      return nextFontFamily;
    }
  }

  return LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY;
}

export function getLiveDictAreaPixiTextStyleSet(): LiveDictAreaPixiTextStyleSet {
  return {
    edgeLabelFontSize: 8,
    edgeLabelFontWeight: "700",
    edgeRowFontSize: 10.4,
    edgeRowFontWeight: "400",
    rowFontSize: 12,
    rowFontWeight: "600",
    titleFontSize: 8,
    titleFontWeight: "700",
  };
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
