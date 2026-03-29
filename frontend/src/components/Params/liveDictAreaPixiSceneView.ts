import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import {
  LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  LIVE_DICT_AREA_PIXI_PARAM_AREA_CONTENT_RIGHT_PADDING_PX,
  LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT,
} from "./liveDictAreaPixiLayout";
import {
  PARAM_CONTAINER_CENTER_GUTTER_PX,
  PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX,
  PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX,
} from "./paramContainerView";
import type { ParamEditorKind } from "./paramEditorActivation";

export const LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY =
  "ui-sans-serif, system-ui, sans-serif";
export const LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH = 200;
export const LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT =
  LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT;
export const LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS = 2048 * 2048;
export const LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM =
  "liveDictAreaPixiOverview";

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

export type LiveDictAreaPixiPresentationMode = "detail" | "overview";

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
const LIVE_DICT_AREA_PIXI_OVERVIEW_ROW_SCREEN_HEIGHT_THRESHOLD = 4.5;
const LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_VALUE = "enabled";

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

export type LiveDictAreaPixiColorControlStyle = {
  backgroundFill: string;
  textFill: string;
};

export type LiveDictAreaPixiCompactRowPrimitive = {
  cornerRadiusPx: number;
  horizontalPaddingPx: number;
  surfaceKind: "filled" | "transparent";
};

export type LiveDictAreaPixiDetailRowChrome = {
  contentInsetPx: number;
  cornerRadiusPx: number;
  fill: string | null;
  labelX: number;
  rowBackgroundWidth: number;
  rowRightEdgeX: number;
  valueColumnX: number;
};

type LiveDictAreaPixiFontFaceSet = Pick<
  FontFaceSet,
  "addEventListener" | "ready" | "removeEventListener" | "status"
>;

type LiveDictAreaPixiRectLike = {
  bottom: number;
  top: number;
};

type LiveDictAreaPixiRgbColor = {
  b: number;
  g: number;
  r: number;
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

type LiveDictAreaPixiCompactRowPrimitiveSource = {
  getComputedStyle?: ((element: Element) => CSSStyleDeclaration) | null;
  rowElement?: Element | null;
};

export function getLiveDictAreaPixiClippingContainer(sceneRoot: HTMLElement) {
  return (
    sceneRoot.closest<HTMLElement>("[data-live-dict-area-render-mode]") ??
    sceneRoot.closest<HTMLElement>(".section-main-full-w") ??
    sceneRoot.closest<HTMLElement>("section") ??
    sceneRoot.parentElement
  );
}

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
  canvasHeight,
  canvasWidth,
  devicePixelRatio,
  viewportZoom,
}: {
  canvasHeight: number;
  canvasWidth: number;
  devicePixelRatio: number;
  viewportZoom: number;
}) {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const safeViewportZoom =
    Number.isFinite(viewportZoom) && viewportZoom > 0 ? viewportZoom : 1;
  const requestedResolution = safeDevicePixelRatio * safeViewportZoom;
  const safeCanvasWidth =
    Number.isFinite(canvasWidth) && canvasWidth > 0
      ? Math.floor(canvasWidth)
      : 0;
  const safeCanvasHeight =
    Number.isFinite(canvasHeight) && canvasHeight > 0
      ? Math.floor(canvasHeight)
      : 0;

  if (safeCanvasWidth === 0 || safeCanvasHeight === 0) {
    return requestedResolution;
  }

  const maxResolutionFromBackingPixels = Math.sqrt(
    LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS /
      (safeCanvasWidth * safeCanvasHeight),
  );

  if (
    !Number.isFinite(maxResolutionFromBackingPixels) ||
    maxResolutionFromBackingPixels <= 0
  ) {
    return requestedResolution;
  }

  return Math.min(requestedResolution, maxResolutionFromBackingPixels);
}

export function getLiveDictAreaPixiTextResolution(renderResolution: number) {
  return Number.isFinite(renderResolution) && renderResolution > 1
    ? renderResolution
    : 1;
}

export function getLiveDictAreaPixiCompactRowPrimitive({
  getComputedStyle,
  rowElement,
}: LiveDictAreaPixiCompactRowPrimitiveSource): LiveDictAreaPixiCompactRowPrimitive {
  if (!rowElement || !getComputedStyle) {
    return getLiveDictAreaPixiFallbackCompactRowPrimitive();
  }

  const computedStyle = getComputedStyle(rowElement);
  const cornerRadiusPx = getLiveDictAreaPixiResolvedLengthPx({
    fallbackValue: PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX,
    value: computedStyle.borderTopLeftRadius,
  });
  const horizontalPaddingPx = Math.min(
    getLiveDictAreaPixiResolvedLengthPx({
      fallbackValue: PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX,
      value: computedStyle.paddingLeft,
    }),
    getLiveDictAreaPixiResolvedLengthPx({
      fallbackValue: PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX,
      value: computedStyle.paddingRight,
    }),
  );

  return {
    cornerRadiusPx,
    horizontalPaddingPx,
    surfaceKind: getLiveDictAreaPixiUsableComputedColor(
      computedStyle.backgroundColor,
    )
      ? "filled"
      : "transparent",
  };
}

export function getLiveDictAreaPixiDetailRowChrome({
  compactRowPrimitive,
  palette,
  paramColumnWidth,
  rowKind,
  rowWidth,
  rowX,
}: {
  compactRowPrimitive: LiveDictAreaPixiCompactRowPrimitive;
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  rowKind: "group" | "placeholder" | "value";
  rowWidth: number;
  rowX: number;
}): LiveDictAreaPixiDetailRowChrome {
  const contentInsetPx = Math.max(
    0,
    Math.floor(compactRowPrimitive.horizontalPaddingPx),
  );
  const cornerRadiusPx = Math.max(
    0,
    Math.floor(compactRowPrimitive.cornerRadiusPx),
  );
  const fill =
    rowKind === "placeholder"
      ? palette.rowPlaceholderFill
      : compactRowPrimitive.surfaceKind === "transparent"
        ? null
        : rowKind === "group"
          ? palette.rowBackgroundAlt
          : palette.rowBackground;

  return {
    contentInsetPx,
    cornerRadiusPx,
    fill,
    labelX: rowX + contentInsetPx,
    rowBackgroundWidth: Math.max(
      0,
      rowWidth - rowX - LIVE_DICT_AREA_PIXI_PARAM_AREA_CONTENT_RIGHT_PADDING_PX,
    ),
    rowRightEdgeX:
      rowWidth -
      (LIVE_DICT_AREA_PIXI_PARAM_AREA_CONTENT_RIGHT_PADDING_PX +
        contentInsetPx),
    valueColumnX:
      rowX + contentInsetPx + paramColumnWidth + PARAM_CONTAINER_CENTER_GUTTER_PX,
  };
}

export function resolveLiveDictAreaPixiOverviewEnabled({
  search,
}: {
  search: string | null | undefined;
}) {
  return (
    new URLSearchParams(search ?? "").get(
      LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM,
    ) === LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_VALUE
  );
}

export function readLiveDictAreaPixiOverviewEnabledFromWindow() {
  if (typeof globalThis.window !== "object") {
    return false;
  }

  return resolveLiveDictAreaPixiOverviewEnabled({
    search: globalThis.location?.search ?? "",
  });
}

export function getLiveDictAreaPixiPresentationMode(
  viewportZoom: number,
  { overviewEnabled = false }: { overviewEnabled?: boolean } = {},
): LiveDictAreaPixiPresentationMode {
  if (!overviewEnabled || !Number.isFinite(viewportZoom) || viewportZoom <= 0) {
    return "detail";
  }

  return LIVE_DICT_AREA_PIXI_ROW_BLOCK_HEIGHT * viewportZoom <
    LIVE_DICT_AREA_PIXI_OVERVIEW_ROW_SCREEN_HEIGHT_THRESHOLD
    ? "overview"
    : "detail";
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
  const computedChrome = getLiveDictAreaPixiComputedChrome({
    getComputedStyle,
    host,
  });
  const computedFallbackPalette = getLiveDictAreaPixiFallbackPalette({
    darkMode:
      getLiveDictAreaPixiComputedChromeDarkMode(
        computedChrome?.backgroundColor ?? null,
      ) ?? darkMode,
    sectionStyleColor,
  });
  const computedReadableTextColor =
    getLiveDictAreaPixiComputedReadableTextColor({
      backgroundColor: computedChrome?.backgroundColor ?? null,
      textColor: computedChrome?.textColor ?? null,
    });

  return {
    bodyText:
      sectionText ||
      computedReadableTextColor ||
      computedFallbackPalette.bodyText,
    border:
      sectionBorder ||
      computedChrome?.borderColor ||
      computedFallbackPalette.border,
    panelBackground:
      sectionPanelBackground ||
      computedChrome?.backgroundColor ||
      computedFallbackPalette.panelBackground,
    panelBackgroundAlt:
      sectionBackground ||
      computedChrome?.backgroundColor ||
      computedFallbackPalette.panelBackgroundAlt,
    portDot: sectionMutedText || computedFallbackPalette.portDot,
    portSelectedDot: sectionOutline || computedFallbackPalette.portSelectedDot,
    rowBackground: sectionBackground || computedFallbackPalette.rowBackground,
    rowBackgroundAlt:
      sectionPanelBackground || computedFallbackPalette.rowBackgroundAlt,
    rowPlaceholderFill:
      sectionBackground || computedFallbackPalette.rowPlaceholderFill,
    titleText: sectionMutedText || computedFallbackPalette.titleText,
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

export function getLiveDictAreaPixiColorControlStyle({
  editorKind,
  valueText,
}: {
  editorKind?: ParamEditorKind;
  valueText: string | null;
}): LiveDictAreaPixiColorControlStyle | null {
  if (editorKind !== "color-picker" || !valueText) {
    return null;
  }

  const backgroundFill = getLiveDictAreaPixiUsableComputedColor(valueText);
  if (!backgroundFill || !parseLiveDictAreaPixiRgbColor(backgroundFill)) {
    return null;
  }

  return {
    backgroundFill,
    textFill: getLiveDictAreaPixiColorControlTextFill(backgroundFill),
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

function getLiveDictAreaPixiFallbackCompactRowPrimitive(): LiveDictAreaPixiCompactRowPrimitive {
  return {
    cornerRadiusPx: PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX,
    horizontalPaddingPx: PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX,
    surfaceKind: "transparent",
  };
}

function getLiveDictAreaPixiResolvedLengthPx({
  fallbackValue,
  value,
}: {
  fallbackValue: number;
  value: string | null | undefined;
}) {
  const parsedValue = Number.parseFloat(value ?? "");

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallbackValue;
}

function getLiveDictAreaPixiComputedChrome({
  getComputedStyle,
  host,
}: {
  getComputedStyle: (element: Element) => CSSStyleDeclaration;
  host: Element;
}): {
  backgroundColor: string | null;
  borderColor: string | null;
  textColor: string | null;
} | null {
  let current: Element | null = host;
  let backgroundColor: string | null = null;
  let borderColor: string | null = null;
  let textColor: string | null = null;

  while (current) {
    const computedStyle = getComputedStyle(current);
    backgroundColor ??= getLiveDictAreaPixiUsableComputedColor(
      computedStyle.backgroundColor,
    );
    borderColor ??= getLiveDictAreaPixiUsableComputedColor(
      computedStyle.borderColor,
    );
    textColor ??= getLiveDictAreaPixiUsableComputedColor(computedStyle.color);

    if (backgroundColor && borderColor && textColor) {
      break;
    }

    current = current.parentElement;
  }

  if (!backgroundColor && !borderColor && !textColor) {
    return null;
  }

  return {
    backgroundColor,
    borderColor,
    textColor,
  };
}

function getLiveDictAreaPixiComputedChromeDarkMode(
  backgroundColor: string | null,
): boolean | null {
  const rgbColor = parseLiveDictAreaPixiRgbColor(backgroundColor);
  if (!rgbColor) {
    return null;
  }

  return getLiveDictAreaPixiRelativeLuminance(rgbColor) < 0.3;
}

function getLiveDictAreaPixiComputedReadableTextColor({
  backgroundColor,
  textColor,
}: {
  backgroundColor: string | null;
  textColor: string | null;
}) {
  const backgroundRgbColor = parseLiveDictAreaPixiRgbColor(backgroundColor);
  const textRgbColor = parseLiveDictAreaPixiRgbColor(textColor);
  if (!backgroundRgbColor || !textRgbColor) {
    return textColor;
  }

  return getLiveDictAreaPixiContrastRatio(backgroundRgbColor, textRgbColor) >=
    4.5
    ? textColor
    : null;
}

function getLiveDictAreaPixiUsableComputedColor(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();

  if (
    normalizedValue.length === 0 ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0,0,0,0)" ||
    normalizedValue === "hsla(0, 0%, 0%, 0)" ||
    normalizedValue === "hsla(0,0%,0%,0)"
  ) {
    return null;
  }

  return rawValue.trim();
}

function getLiveDictAreaPixiColorControlTextFill(backgroundColor: string) {
  const backgroundRgbColor = parseLiveDictAreaPixiRgbColor(backgroundColor);
  if (!backgroundRgbColor) {
    return "#0f172a";
  }

  return getLiveDictAreaPixiRelativeLuminance(backgroundRgbColor) < 0.35
    ? "#f8fafc"
    : "#0f172a";
}

function parseLiveDictAreaPixiRgbColor(
  rawValue: string | null | undefined,
): LiveDictAreaPixiRgbColor | null {
  if (!rawValue) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue.startsWith("#")) {
    const hexValue = normalizedValue.slice(1);
    if (hexValue.length !== 6) {
      return null;
    }

    const r = Number.parseInt(hexValue.slice(0, 2), 16);
    const g = Number.parseInt(hexValue.slice(2, 4), 16);
    const b = Number.parseInt(hexValue.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }

    return { b, g, r };
  }

  const channelMatches = normalizedValue.match(/\d+(?:\.\d+)?/g);
  if (!channelMatches || channelMatches.length < 3) {
    return null;
  }

  const [rawR, rawG, rawB] = channelMatches;
  const r = Number.parseFloat(rawR);
  const g = Number.parseFloat(rawG);
  const b = Number.parseFloat(rawB);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }

  return {
    b: Math.max(0, Math.min(255, Math.round(b))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    r: Math.max(0, Math.min(255, Math.round(r))),
  };
}

function getLiveDictAreaPixiRelativeLuminance({
  b,
  g,
  r,
}: LiveDictAreaPixiRgbColor) {
  const red = getLiveDictAreaPixiLinearizedColorChannel(r);
  const green = getLiveDictAreaPixiLinearizedColorChannel(g);
  const blue = getLiveDictAreaPixiLinearizedColorChannel(b);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getLiveDictAreaPixiContrastRatio(
  a: LiveDictAreaPixiRgbColor,
  b: LiveDictAreaPixiRgbColor,
) {
  const luminanceA = getLiveDictAreaPixiRelativeLuminance(a);
  const luminanceB = getLiveDictAreaPixiRelativeLuminance(b);
  const lighterLuminance = Math.max(luminanceA, luminanceB);
  const darkerLuminance = Math.min(luminanceA, luminanceB);

  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
}

function getLiveDictAreaPixiLinearizedColorChannel(channel: number) {
  const normalizedChannel = channel / 255;
  if (normalizedChannel <= 0.04045) {
    return normalizedChannel / 12.92;
  }

  return Math.pow((normalizedChannel + 0.055) / 1.055, 2.4);
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
