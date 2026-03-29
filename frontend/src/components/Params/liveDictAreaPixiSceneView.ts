import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import {
  LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT,
  LIVE_DICT_AREA_PIXI_LAYOUT,
} from "./liveDictAreaPixiLayout";

export const LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY =
  "ui-sans-serif, system-ui, sans-serif";
export const LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH = 200;
export const LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT =
  LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT;

export type LiveDictAreaPixiPalette = {
  bodyText: string;
  border: string;
  panelBackground: string;
  panelBackgroundAlt: string;
  portDot: string;
  portSelectedDot: string;
  rowBackground: string;
  rowBackgroundAlt: string;
  rowPlaceholderFill: string;
  titleText: string;
};

const LIVE_DICT_AREA_PIXI_FALLBACK_DARK_PALETTE: LiveDictAreaPixiPalette = {
  bodyText: "#e5e7eb",
  border: "#334155",
  panelBackground: "#111827",
  panelBackgroundAlt: "#0f172a",
  portDot: "#94a3b8",
  portSelectedDot: "#38bdf8",
  rowBackground: "#172036",
  rowBackgroundAlt: "#1e293b",
  rowPlaceholderFill: "#1f2937",
  titleText: "#94a3b8",
};

const LIVE_DICT_AREA_PIXI_FALLBACK_LIGHT_PALETTE: LiveDictAreaPixiPalette = {
  bodyText: "#0f172a",
  border: "#cbd5e1",
  panelBackground: "#f8fafc",
  panelBackgroundAlt: "#f1f5f9",
  portDot: "#64748b",
  portSelectedDot: "#0284c7",
  rowBackground: "#ffffff",
  rowBackgroundAlt: "#eef2ff",
  rowPlaceholderFill: "#f8fafc",
  titleText: "#475569",
};

const LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET = {
  edgeLabelFontSize: 8,
  edgeLabelFontWeight: "700",
  edgeRowFontSize: 10.4,
  edgeRowFontWeight: "400",
  rowFontSize: 12,
  rowFontWeight: "600",
  titleFontSize: 8,
  titleFontWeight: "700",
} as const;

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

type LiveDictAreaPixiRectLike = {
  bottom: number;
  top: number;
};

type LiveDictAreaPixiOffsetElement = {
  clientHeight: number;
  getBoundingClientRect?: (() => LiveDictAreaPixiRectLike) | null;
  offsetHeight: number;
  offsetParent: LiveDictAreaPixiOffsetElement | null;
  offsetTop: number;
};

type LiveDictAreaPixiTextStyleSource = {
  edgeLabelElement?: Element | null;
  edgeRowElement?: Element | null;
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
  rowElement?: Element | null;
};

export function getLiveDictAreaPixiLogicalCanvasWidth(hostWidth: number) {
  const safeHostWidth =
    Number.isFinite(hostWidth) && hostWidth > 0 ? Math.floor(hostWidth) : 0;

  return Math.max(safeHostWidth, LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth);
}

export function getLiveDictAreaPixiMaxCanvasHeight(containerHeight: number) {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) {
    return null;
  }

  return Math.floor(containerHeight);
}

export function getLiveDictAreaPixiUsableMaxCanvasHeight(
  maxCanvasHeight: number | null | undefined,
) {
  if (
    typeof maxCanvasHeight !== "number" ||
    !Number.isFinite(maxCanvasHeight) ||
    maxCanvasHeight < LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT
  ) {
    return null;
  }

  return Math.floor(maxCanvasHeight);
}

export function getLiveDictAreaPixiAvailableCanvasHeight({
  clippingContainer,
  sceneRoot,
}: {
  clippingContainer: LiveDictAreaPixiOffsetElement;
  sceneRoot: LiveDictAreaPixiOffsetElement;
}) {
  const relativeOffsetTop = getLiveDictAreaPixiRelativeOffsetTop({
    ancestor: clippingContainer,
    element: sceneRoot,
  });
  const containerHeight =
    clippingContainer.clientHeight > 0
      ? clippingContainer.clientHeight
      : clippingContainer.offsetHeight;

  if (relativeOffsetTop !== null && containerHeight > 0) {
    return getLiveDictAreaPixiMaxCanvasHeight(
      containerHeight - relativeOffsetTop,
    );
  }

  const clippingRect = clippingContainer.getBoundingClientRect?.();
  const sceneRootRect = sceneRoot.getBoundingClientRect?.();
  if (!clippingRect || !sceneRootRect) {
    return null;
  }

  return getLiveDictAreaPixiMaxCanvasHeight(
    clippingRect.bottom - sceneRootRect.top,
  );
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

export function getLiveDictAreaPixiTextResolution(renderResolution: number) {
  return Number.isFinite(renderResolution) && renderResolution > 1
    ? renderResolution
    : 1;
}

export function getLiveDictAreaPixiPalette({
  darkMode,
  getComputedStyle,
  host,
  sectionStyleColor,
}: {
  darkMode: boolean;
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
  host?: Element | null;
  sectionStyleColor?: string | null;
}): LiveDictAreaPixiPalette {
  const fallbackPalette = getLiveDictAreaPixiFallbackPalette({
    darkMode,
    sectionStyleColor,
  });

  if (!host || !getComputedStyle) {
    return fallbackPalette;
  }

  const computedStyle = getComputedStyle(host);
  const sectionPanelBackground = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-panel-bg",
  });
  const sectionBackground = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-bg",
  });
  const sectionBorder = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-border",
  });
  const sectionOutline = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-outline",
  });
  const sectionText = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-text",
  });
  const sectionMutedText = readLiveDictAreaPixiCssVariable({
    computedStyle,
    propertyName: "--setta-section-style-muted-text",
  });

  return {
    bodyText: sectionText || fallbackPalette.bodyText,
    border: sectionBorder || fallbackPalette.border,
    panelBackground: sectionPanelBackground || fallbackPalette.panelBackground,
    panelBackgroundAlt: sectionBackground || fallbackPalette.panelBackgroundAlt,
    portDot: sectionMutedText || fallbackPalette.portDot,
    portSelectedDot: sectionOutline || fallbackPalette.portSelectedDot,
    rowBackground: sectionBackground || fallbackPalette.rowBackground,
    rowBackgroundAlt:
      sectionPanelBackground || fallbackPalette.rowBackgroundAlt,
    rowPlaceholderFill: sectionBackground || fallbackPalette.rowPlaceholderFill,
    titleText: sectionMutedText || fallbackPalette.titleText,
  };
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

export function getLiveDictAreaPixiParamColumnWidth({
  getComputedStyle,
  host,
}: {
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
  host?: Element | null;
}) {
  if (!host || !getComputedStyle) {
    return LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH;
  }

  const rawValue = getComputedStyle(host)
    .getPropertyValue("--param-column-width")
    .trim();
  const parsedValue = Number.parseFloat(rawValue);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH;
}

function getLiveDictAreaPixiResolvedFontSize({
  element,
  fallbackValue,
  getComputedStyle,
}: {
  element?: Element | null;
  fallbackValue: number;
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
}) {
  if (!element || !getComputedStyle) {
    return fallbackValue;
  }

  const nextFontSize = Number.parseFloat(getComputedStyle(element).fontSize);

  return Number.isFinite(nextFontSize) && nextFontSize > 0
    ? nextFontSize
    : fallbackValue;
}

function getLiveDictAreaPixiResolvedFontWeight({
  element,
  fallbackValue,
  getComputedStyle,
}: {
  element?: Element | null;
  fallbackValue: string;
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
}) {
  if (!element || !getComputedStyle) {
    return fallbackValue;
  }

  const nextFontWeight = getComputedStyle(element).fontWeight.trim();

  return nextFontWeight || fallbackValue;
}

export function getLiveDictAreaPixiTextStyleSet({
  edgeLabelElement,
  edgeRowElement,
  getComputedStyle,
  rowElement,
}: LiveDictAreaPixiTextStyleSource = {}): LiveDictAreaPixiTextStyleSet {
  const edgeLabelFontSize = getLiveDictAreaPixiResolvedFontSize({
    element: edgeLabelElement,
    fallbackValue:
      LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.edgeLabelFontSize,
    getComputedStyle,
  });
  const edgeLabelFontWeight = getLiveDictAreaPixiResolvedFontWeight({
    element: edgeLabelElement,
    fallbackValue:
      LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.edgeLabelFontWeight,
    getComputedStyle,
  });
  const edgeRowFontSize = getLiveDictAreaPixiResolvedFontSize({
    element: edgeRowElement,
    fallbackValue: LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.edgeRowFontSize,
    getComputedStyle,
  });
  const edgeRowFontWeight = getLiveDictAreaPixiResolvedFontWeight({
    element: edgeRowElement,
    fallbackValue:
      LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.edgeRowFontWeight,
    getComputedStyle,
  });
  const rowFontSize = getLiveDictAreaPixiResolvedFontSize({
    element: rowElement,
    fallbackValue: LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.rowFontSize,
    getComputedStyle,
  });
  const rowFontWeight = getLiveDictAreaPixiResolvedFontWeight({
    element: rowElement,
    fallbackValue: LIVE_DICT_AREA_PIXI_FALLBACK_TEXT_STYLE_SET.rowFontWeight,
    getComputedStyle,
  });

  return {
    edgeLabelFontSize,
    edgeLabelFontWeight,
    edgeRowFontSize,
    edgeRowFontWeight,
    rowFontSize,
    rowFontWeight,
    titleFontSize: edgeLabelFontSize,
    titleFontWeight: edgeLabelFontWeight,
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

function readLiveDictAreaPixiCssVariable({
  computedStyle,
  propertyName,
}: {
  computedStyle: CSSStyleDeclaration;
  propertyName: string;
}) {
  return computedStyle.getPropertyValue(propertyName).trim();
}

function getLiveDictAreaPixiFallbackPalette({
  darkMode,
  sectionStyleColor,
}: {
  darkMode: boolean;
  sectionStyleColor?: string | null;
}) {
  const defaultPalette = darkMode
    ? LIVE_DICT_AREA_PIXI_FALLBACK_DARK_PALETTE
    : LIVE_DICT_AREA_PIXI_FALLBACK_LIGHT_PALETTE;
  const sectionStyleTheme =
    sectionStyleColor === null || sectionStyleColor === undefined
      ? null
      : deriveSectionStyleTheme(sectionStyleColor, darkMode);

  if (!sectionStyleTheme) {
    return defaultPalette;
  }

  return {
    bodyText: sectionStyleTheme.text,
    border: sectionStyleTheme.border,
    panelBackground: sectionStyleTheme.panelBg,
    panelBackgroundAlt: sectionStyleTheme.bg,
    portDot: sectionStyleTheme.mutedText,
    portSelectedDot: sectionStyleTheme.outline,
    rowBackground: sectionStyleTheme.bg,
    rowBackgroundAlt: sectionStyleTheme.panelBg,
    rowPlaceholderFill: sectionStyleTheme.bg,
    titleText: sectionStyleTheme.mutedText,
  };
}

function getLiveDictAreaPixiRelativeOffsetTop({
  ancestor,
  element,
}: {
  ancestor: LiveDictAreaPixiOffsetElement;
  element: LiveDictAreaPixiOffsetElement;
}) {
  let current: LiveDictAreaPixiOffsetElement | null = element;
  let totalOffsetTop = 0;

  while (current && current !== ancestor) {
    totalOffsetTop += current.offsetTop;
    current = current.offsetParent;
  }

  return current === ancestor ? totalOffsetTop : null;
}
