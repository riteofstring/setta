import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { describe, expect, it, vi } from "vitest";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiAvailableCanvasHeight,
  getLiveDictAreaPixiClippingContainer,
  getLiveDictAreaPixiColorControlStyle,
  getLiveDictAreaPixiComboboxControlStyle,
  getLiveDictAreaPixiCompactRowPrimitive,
  getLiveDictAreaPixiDetailRowChrome,
  getLiveDictAreaPixiDetailRowInteractionChrome,
  getLiveDictAreaPixiEdgePortChrome,
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiLowZoomGlyphPalette,
  getLiveDictAreaPixiMaxCanvasHeight,
  getLiveDictAreaPixiPalette,
  getLiveDictAreaPixiParamColumnWidth,
  getLiveDictAreaPixiPresentationMode,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiShouldForceReadableRowFill,
  getLiveDictAreaPixiSwitchControlStyle,
  getLiveDictAreaPixiTextFontFamily,
  getLiveDictAreaPixiTextResolution,
  getLiveDictAreaPixiTextStyleSet,
  getLiveDictAreaPixiUsableMaxCanvasHeight,
  LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY,
  LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH,
  LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS,
  LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT,
  LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM,
  resolveLiveDictAreaPixiOverviewEnabled,
  subscribeToLiveDictAreaPixiFontLoadInvalidation,
} from "./liveDictAreaPixiSceneView";

describe("getLiveDictAreaPixiLogicalCanvasWidth", () => {
  it("keeps the scene layout width in logical flow space", () => {
    expect(getLiveDictAreaPixiLogicalCanvasWidth(512.8)).toBe(512);
    expect(getLiveDictAreaPixiLogicalCanvasWidth(0)).toBe(
      LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
    );
  });
});

describe("getLiveDictAreaPixiMaxCanvasHeight", () => {
  it("normalizes the mounted card-body height to a finite integer canvas limit", () => {
    expect(getLiveDictAreaPixiMaxCanvasHeight(210.9)).toBe(210);
  });

  it("skips clamping when the mounted container height is unavailable", () => {
    expect(getLiveDictAreaPixiMaxCanvasHeight(0)).toBeNull();
    expect(getLiveDictAreaPixiMaxCanvasHeight(Number.NaN)).toBeNull();
  });
});

describe("getLiveDictAreaPixiUsableMaxCanvasHeight", () => {
  it("drops pathological sub-row height clamps before building the live Pixi layout", () => {
    expect(getLiveDictAreaPixiUsableMaxCanvasHeight(4)).toBeNull();
    expect(
      getLiveDictAreaPixiUsableMaxCanvasHeight(
        LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT - 1,
      ),
    ).toBeNull();
  });

  it("keeps finite mounted heights once the card can show at least one useful row", () => {
    expect(
      getLiveDictAreaPixiUsableMaxCanvasHeight(
        LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT + 7.8,
      ),
    ).toBe(LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT + 7);
  });
});

describe("getLiveDictAreaPixiAvailableCanvasHeight", () => {
  it("measures the remaining canvas height in unscaled layout space when offset metrics are available", () => {
    const clippingContainer = {
      clientHeight: 98,
      getBoundingClientRect: () => ({
        bottom: 9.8,
        top: 0,
      }),
      offsetHeight: 98,
      offsetParent: null,
      offsetTop: 0,
    };
    const sceneRoot = {
      clientHeight: 0,
      getBoundingClientRect: () => ({
        bottom: 9.8,
        top: 5.5,
      }),
      offsetHeight: 0,
      offsetParent: clippingContainer,
      offsetTop: 35,
    };

    expect(
      getLiveDictAreaPixiAvailableCanvasHeight({
        clippingContainer,
        sceneRoot,
      }),
    ).toBe(63);
  });

  it("falls back to transformed DOM rects when the offset-parent chain is unavailable", () => {
    const clippingContainer = {
      clientHeight: 0,
      getBoundingClientRect: () => ({
        bottom: 142.8,
        top: 0,
      }),
      offsetHeight: 0,
      offsetParent: null,
      offsetTop: 0,
    };
    const sceneRoot = {
      clientHeight: 0,
      getBoundingClientRect: () => ({
        bottom: 104.4,
        top: 42.2,
      }),
      offsetHeight: 0,
      offsetParent: null,
      offsetTop: 18,
    };

    expect(
      getLiveDictAreaPixiAvailableCanvasHeight({
        clippingContainer,
        sceneRoot,
      }),
    ).toBe(100);
  });
});

describe("getLiveDictAreaPixiClippingContainer", () => {
  it("prefers the dedicated Pixi clipping container over the outer render shell", () => {
    const section = {};
    const clippingContainer = {};
    const renderShell = {};
    const sceneRoot = {
      closest: vi.fn((selector: string) => {
        if (selector === "[data-live-dict-area-pixi-clipping-container]") {
          return clippingContainer;
        }
        if (selector === "[data-live-dict-area-render-mode]") {
          return renderShell;
        }
        if (selector === "section") {
          return section;
        }
        return null;
      }),
      parentElement: section,
    };

    expect(
      getLiveDictAreaPixiClippingContainer(sceneRoot as unknown as HTMLElement),
    ).toBe(clippingContainer);
  });

  it("falls back to the nearest section or parent when the render shell marker is unavailable", () => {
    const section = {};
    const sectionSceneRoot = {
      closest: vi.fn((selector: string) =>
        selector === "section" ? section : null,
      ),
      parentElement: null,
    };

    expect(
      getLiveDictAreaPixiClippingContainer(
        sectionSceneRoot as unknown as HTMLElement,
      ),
    ).toBe(section);

    const detachedParent = {};
    const detachedSceneRoot = {
      closest: vi.fn(() => null),
      parentElement: detachedParent,
    };

    expect(
      getLiveDictAreaPixiClippingContainer(
        detachedSceneRoot as unknown as HTMLElement,
      ),
    );
  });
});

describe("getLiveDictAreaPixiRenderResolution", () => {
  it("keeps the Pixi render resolution at the device-pixel floor while still scaling up on zoom-in", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
        canvasHeight: 240,
        canvasWidth: 320,
        devicePixelRatio: 2,
        viewportZoom: 1,
      }),
    ).toBe(2);
    expect(
      getLiveDictAreaPixiRenderResolution({
        canvasHeight: 240,
        canvasWidth: 320,
        devicePixelRatio: 2,
        viewportZoom: 1.5,
      }),
    ).toBe(3);
    expect(
      getLiveDictAreaPixiRenderResolution({
        canvasHeight: 240,
        canvasWidth: 320,
        devicePixelRatio: 2,
        viewportZoom: 0.1,
      }),
    ).toBe(2);
  });

  it("caps oversized live scenes to a bounded backing-pixel budget during zoomed redraws", () => {
    const cappedResolution = getLiveDictAreaPixiRenderResolution({
      canvasHeight: 900,
      canvasWidth: 1200,
      devicePixelRatio: 2,
      viewportZoom: 2,
    });

    expect(cappedResolution).toBeLessThan(4);
    expect(cappedResolution).toBeCloseTo(
      Math.sqrt(LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS / (1200 * 900)),
      6,
    );
  });

  it("falls back to sane defaults for invalid metrics", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
        canvasHeight: 0,
        canvasWidth: 0,
        devicePixelRatio: Number.NaN,
        viewportZoom: 0,
      }),
    ).toBe(1);
  });
});

describe("getLiveDictAreaPixiTextResolution", () => {
  it("never lets fitted Pixi row text render below 1x resolution", () => {
    expect(getLiveDictAreaPixiTextResolution(0.2)).toBe(1);
    expect(getLiveDictAreaPixiTextResolution(1)).toBe(1);
    expect(getLiveDictAreaPixiTextResolution(2.5)).toBe(2.5);
  });
});

describe("getLiveDictAreaPixiCompactRowPrimitive", () => {
  it("falls back to the DOM compact-row defaults when no measured row exists yet", () => {
    expect(getLiveDictAreaPixiCompactRowPrimitive({})).toEqual({
      cornerRadiusPx: 2,
      horizontalPaddingPx: 2,
      surfaceKind: "transparent",
    });
  });

  it("reads the compact row radius, horizontal padding, and transparent default surface from the measured DOM row", () => {
    const rowElement = {} as Element;
    const getComputedStyle = vi.fn(() => ({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderTopLeftRadius: "2px",
      paddingLeft: "2px",
      paddingRight: "2px",
    })) as unknown as typeof window.getComputedStyle;

    expect(
      getLiveDictAreaPixiCompactRowPrimitive({
        getComputedStyle,
        rowElement,
      }),
    ).toEqual({
      cornerRadiusPx: 2,
      horizontalPaddingPx: 2,
      surfaceKind: "transparent",
    });
  });

  it("marks the primitive as filled when the DOM row shell has a real background color", () => {
    const rowElement = {} as Element;
    const getComputedStyle = vi.fn(() => ({
      backgroundColor: "rgb(15, 23, 42)",
      borderTopLeftRadius: "3px",
      paddingLeft: "4px",
      paddingRight: "6px",
    })) as unknown as typeof window.getComputedStyle;

    expect(
      getLiveDictAreaPixiCompactRowPrimitive({
        getComputedStyle,
        rowElement,
      }),
    ).toEqual({
      cornerRadiusPx: 3,
      horizontalPaddingPx: 4,
      surfaceKind: "filled",
    });
  });
});

describe("getLiveDictAreaPixiDetailRowChrome", () => {
  const palette = {
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
  } as const;

  it("drops default detail-row fills when the measured compact row surface is transparent", () => {
    expect(
      getLiveDictAreaPixiDetailRowChrome({
        compactRowPrimitive: {
          cornerRadiusPx: 2,
          horizontalPaddingPx: 2,
          surfaceKind: "transparent",
        },
        palette,
        paramColumnWidth: 200,
        rowKind: "value",
        rowContentX: 12,
        rowSurfaceX: 0,
        rowWidth: 320,
      }),
    ).toEqual({
      contentInsetPx: 2,
      cornerRadiusPx: 2,
      fill: null,
      labelX: 14,
      rowBackgroundWidth: 314,
      rowRightEdgeX: 312,
      valueColumnX: 226,
    });
  });

  it("keeps placeholder row fills even when ordinary detail rows stay transparent", () => {
    expect(
      getLiveDictAreaPixiDetailRowChrome({
        compactRowPrimitive: {
          cornerRadiusPx: 2,
          horizontalPaddingPx: 2,
          surfaceKind: "transparent",
        },
        palette,
        paramColumnWidth: 200,
        rowKind: "placeholder",
        rowContentX: 12,
        rowSurfaceX: 0,
        rowWidth: 320,
      }).fill,
    ).toBe(palette.rowPlaceholderFill);
  });

  it("restores low-zoom row fills when transparent DOM row chrome would otherwise vanish on screen", () => {
    expect(
      getLiveDictAreaPixiDetailRowChrome({
        compactRowPrimitive: {
          cornerRadiusPx: 2,
          horizontalPaddingPx: 2,
          surfaceKind: "transparent",
        },
        forceReadableSurface: true,
        palette,
        paramColumnWidth: 200,
        rowKind: "value",
        rowContentX: 12,
        rowSurfaceX: 0,
        rowWidth: 320,
      }).fill,
    ).toBe(palette.rowBackground);
    expect(
      getLiveDictAreaPixiDetailRowChrome({
        compactRowPrimitive: {
          cornerRadiusPx: 2,
          horizontalPaddingPx: 2,
          surfaceKind: "transparent",
        },
        forceReadableSurface: true,
        palette,
        paramColumnWidth: 200,
        rowKind: "group",
        rowContentX: 12,
        rowSurfaceX: 0,
        rowWidth: 320,
      }).fill,
    ).toBe(palette.rowBackgroundAlt);
  });

  it("keeps the measured radius and filled row surface when the DOM row shell is actually filled", () => {
    expect(
      getLiveDictAreaPixiDetailRowChrome({
        compactRowPrimitive: {
          cornerRadiusPx: 4,
          horizontalPaddingPx: 3,
          surfaceKind: "filled",
        },
        palette,
        paramColumnWidth: 160,
        rowKind: "group",
        rowContentX: 24,
        rowSurfaceX: 0,
        rowWidth: 260,
      }),
    ).toMatchObject({
      contentInsetPx: 3,
      cornerRadiusPx: 4,
      fill: palette.rowBackgroundAlt,
      labelX: 27,
      rowBackgroundWidth: 254,
      rowRightEdgeX: 251,
      valueColumnX: 199,
    });
  });

  it("clamps the value column inside narrow low-zoom cards instead of pushing the row previews off-panel", () => {
    const chrome = getLiveDictAreaPixiDetailRowChrome({
      compactRowPrimitive: {
        cornerRadiusPx: 2,
        horizontalPaddingPx: 2,
        surfaceKind: "transparent",
      },
      forceReadableSurface: true,
      palette,
      paramColumnWidth: 200,
      rowKind: "value",
      rowContentX: 12,
      rowSurfaceX: 0,
      rowWidth: 55,
    });

    expect(chrome.labelX).toBe(14);
    expect(chrome.rowRightEdgeX).toBe(47);
    expect(chrome.valueColumnX).toBeLessThanOrEqual(chrome.rowRightEdgeX);
    expect(chrome.valueColumnX).toBe(35);
  });
});

describe("getLiveDictAreaPixiDetailRowInteractionChrome", () => {
  const palette = {
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
  } as const;

  it("keeps the resting detail-row chrome unchanged when the value row is not interactive", () => {
    expect(
      getLiveDictAreaPixiDetailRowInteractionChrome({
        detailRowChrome: { fill: null },
        interactionState: {
          isFocused: false,
          isHovered: false,
          isPressed: false,
        },
        palette,
      }),
    ).toEqual({
      fill: null,
      labelFill: palette.bodyText,
      stroke: null,
      valueFill: palette.bodyText,
    });
  });

  it("raises a value row with hover/focus chrome even when the measured compact row surface is transparent", () => {
    expect(
      getLiveDictAreaPixiDetailRowInteractionChrome({
        detailRowChrome: { fill: null },
        interactionState: {
          isFocused: true,
          isHovered: true,
          isPressed: false,
        },
        palette,
      }),
    ).toEqual({
      fill: palette.rowBackgroundAlt,
      labelFill: palette.bodyText,
      stroke: palette.portSelectedDot,
      valueFill: palette.bodyText,
    });
  });

  it("uses the pressed chrome so active value rows stay visibly distinct before handoff activation", () => {
    const chrome = getLiveDictAreaPixiDetailRowInteractionChrome({
      detailRowChrome: { fill: palette.rowBackground },
      interactionState: {
        isFocused: false,
        isHovered: false,
        isPressed: true,
      },
      palette,
    });

    expect(chrome.fill).toBe(palette.border);
    expect(chrome.stroke).toBe(palette.portSelectedDot);
    expect(chrome.labelFill).toBe(palette.bodyText);
    expect(chrome.valueFill).toBe(palette.bodyText);
  });
});

describe("getLiveDictAreaPixiEdgePortChrome", () => {
  const textStyleSet = {
    edgeLabelFontSize: 8,
    edgeLabelFontWeight: "700",
    edgeRowFontSize: 10.4,
    edgeRowFontWeight: "400",
    rowFontSize: 12,
    rowFontWeight: "600",
    titleFontSize: 8,
    titleFontWeight: "700",
  } as const;

  it("keeps unselected edge rows transparent and on the default edge chrome", () => {
    expect(
      getLiveDictAreaPixiEdgePortChrome({
        isFocused: false,
        isHovered: false,
        isPressed: false,
        isSelected: false,
        palette: {
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
        },
        textStyleSet,
      }),
    ).toEqual({
      dotFill: "#64748b",
      labelFill: "#0f172a",
      labelFontWeight: "400",
      rowFill: null,
      rowStroke: null,
    });
  });

  it("uses the selected row fill with a readable text color for active edge rows", () => {
    expect(
      getLiveDictAreaPixiEdgePortChrome({
        isFocused: false,
        isHovered: false,
        isPressed: false,
        isSelected: true,
        palette: {
          bodyText: "#0f172a",
          border: "#cbd5e1",
          panelBackground: "#f8fafc",
          panelBackgroundAlt: "#f1f5f9",
          portDot: "#64748b",
          portSelectedDot: "#1d4ed8",
          rowBackground: "#ffffff",
          rowBackgroundAlt: "#eef2ff",
          rowPlaceholderFill: "#f8fafc",
          titleText: "#475569",
        },
        textStyleSet,
      }),
    ).toEqual({
      dotFill: "#1d4ed8",
      labelFill: "#f8fafc",
      labelFontWeight: "400",
      rowFill: "#1d4ed8",
      rowStroke: null,
    });
  });

  it("uses hover and focus chrome before selection so edge-strip rows expose a scene-owned affordance", () => {
    expect(
      getLiveDictAreaPixiEdgePortChrome({
        isFocused: true,
        isHovered: true,
        isPressed: false,
        isSelected: false,
        palette: {
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
        },
        textStyleSet,
      }),
    ).toEqual({
      dotFill: "#0284c7",
      labelFill: "#0f172a",
      labelFontWeight: "400",
      rowFill: "#cbd5e1",
      rowStroke: "#0284c7",
    });
  });

  it("uses the pressed fill while keeping a readable label for an unselected interactive edge row", () => {
    expect(
      getLiveDictAreaPixiEdgePortChrome({
        isFocused: false,
        isHovered: false,
        isPressed: true,
        isSelected: false,
        palette: {
          bodyText: "#0f172a",
          border: "#cbd5e1",
          panelBackground: "#f8fafc",
          panelBackgroundAlt: "#f1f5f9",
          portDot: "#64748b",
          portSelectedDot: "#1d4ed8",
          rowBackground: "#ffffff",
          rowBackgroundAlt: "#eef2ff",
          rowPlaceholderFill: "#f8fafc",
          titleText: "#475569",
        },
        textStyleSet,
      }),
    ).toEqual({
      dotFill: "#1d4ed8",
      labelFill: "#f8fafc",
      labelFontWeight: "400",
      rowFill: "#1d4ed8",
      rowStroke: "#1d4ed8",
    });
  });

  it("falls back to the border fill for a pressed selected row so the active click state differs from the resting selection", () => {
    expect(
      getLiveDictAreaPixiEdgePortChrome({
        isFocused: false,
        isHovered: false,
        isPressed: true,
        isSelected: true,
        palette: {
          bodyText: "#0f172a",
          border: "#cbd5e1",
          panelBackground: "#f8fafc",
          panelBackgroundAlt: "#f1f5f9",
          portDot: "#64748b",
          portSelectedDot: "#1d4ed8",
          rowBackground: "#ffffff",
          rowBackgroundAlt: "#eef2ff",
          rowPlaceholderFill: "#f8fafc",
          titleText: "#475569",
        },
        textStyleSet,
      }),
    ).toEqual({
      dotFill: "#1d4ed8",
      labelFill: "#0f172a",
      labelFontWeight: "400",
      rowFill: "#cbd5e1",
      rowStroke: "#1d4ed8",
    });
  });
});

describe("resolveLiveDictAreaPixiOverviewEnabled", () => {
  it("defaults the low-zoom overview experiment off when no explicit opt-in is present", () => {
    expect(
      resolveLiveDictAreaPixiOverviewEnabled({
        search: "",
      }),
    ).toBe(false);
    expect(
      resolveLiveDictAreaPixiOverviewEnabled({
        search: null,
      }),
    ).toBe(false);
  });

  it("enables the overview experiment only for the explicit query-param opt-in", () => {
    expect(
      resolveLiveDictAreaPixiOverviewEnabled({
        search: `?${LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM}=enabled`,
      }),
    ).toBe(true);
    expect(
      resolveLiveDictAreaPixiOverviewEnabled({
        search: `?${LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM}=disabled`,
      }),
    ).toBe(false);
  });
});

describe("getLiveDictAreaPixiPresentationMode", () => {
  it("keeps the detailed row rendering path by default while the overview experiment is disabled", () => {
    expect(getLiveDictAreaPixiPresentationMode(0.12)).toBe("detail");
    expect(getLiveDictAreaPixiPresentationMode(0.2)).toBe("detail");
  });

  it("preserves the low-zoom overview mode behind an explicit opt-in", () => {
    expect(
      getLiveDictAreaPixiPresentationMode(0.12, {
        overviewEnabled: true,
      }),
    ).toBe("overview");
    expect(
      getLiveDictAreaPixiPresentationMode(0.2, {
        overviewEnabled: true,
      }),
    ).toBe("overview");
  });

  it("keeps the detailed row rendering path once the viewport scale is large enough", () => {
    expect(
      getLiveDictAreaPixiPresentationMode(0.3, {
        overviewEnabled: true,
      }),
    ).toBe("detail");
    expect(getLiveDictAreaPixiPresentationMode(1)).toBe("detail");
  });

  it("falls back to detailed mode for invalid zoom values", () => {
    expect(getLiveDictAreaPixiPresentationMode(Number.NaN)).toBe("detail");
    expect(
      getLiveDictAreaPixiPresentationMode(0, {
        overviewEnabled: true,
      }),
    ).toBe("detail");
  });
});

describe("getLiveDictAreaPixiShouldForceReadableRowFill", () => {
  it("forces a visible row silhouette once detail rows are below the on-screen readability threshold", () => {
    expect(getLiveDictAreaPixiShouldForceReadableRowFill(0.1)).toBe(true);
    expect(getLiveDictAreaPixiShouldForceReadableRowFill(0.2)).toBe(true);
  });

  it("keeps the measured DOM row surface behavior once rows are large enough on screen", () => {
    expect(getLiveDictAreaPixiShouldForceReadableRowFill(0.3)).toBe(false);
    expect(getLiveDictAreaPixiShouldForceReadableRowFill(1)).toBe(false);
    expect(getLiveDictAreaPixiShouldForceReadableRowFill(Number.NaN)).toBe(
      false,
    );
  });
});

describe("getLiveDictAreaPixiLowZoomGlyphPalette", () => {
  const palette = {
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

  it("switches low-zoom value rows onto higher-contrast structure fills instead of the faint title tint", () => {
    expect(
      getLiveDictAreaPixiLowZoomGlyphPalette({
        palette,
        rowKind: "value",
      }),
    ).toEqual({
      bandFill: palette.bodyText,
      primaryFill: palette.bodyText,
      valueFill: palette.bodyText,
    });
  });

  it("preserves explicit swatches while brightening the surrounding low-zoom row structure", () => {
    expect(
      getLiveDictAreaPixiLowZoomGlyphPalette({
        palette,
        rowKind: "value",
        valueSwatch: "#ef4444",
      }),
    ).toEqual({
      bandFill: palette.bodyText,
      primaryFill: palette.bodyText,
      valueFill: "#ef4444",
    });
  });

  it("uses the same brighter low-zoom silhouette fill for group rows so nested structure stays visible", () => {
    expect(
      getLiveDictAreaPixiLowZoomGlyphPalette({
        palette,
        rowKind: "group",
      }),
    ).toEqual({
      bandFill: palette.bodyText,
      primaryFill: palette.bodyText,
      valueFill: palette.bodyText,
    });
  });
});

describe("getLiveDictAreaPixiColorControlStyle", () => {
  const palette = {
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
  } as const;

  it("maps closed color-picker rows onto the same neutral field chrome as the DOM baseline", () => {
    expect(
      getLiveDictAreaPixiColorControlStyle({
        darkMode: false,
        editorKind: "color-picker",
      }),
    ).toEqual({
      backgroundFill: palette.panelBackground,
      borderFill: palette.border,
      textFill: palette.bodyText,
    });
  });

  it("ignores swatch color in the closed state and still skips non-color controls", () => {
    expect(
      getLiveDictAreaPixiColorControlStyle({
        darkMode: false,
        editorKind: "color-picker",
      }),
    ).toEqual({
      backgroundFill: palette.panelBackground,
      borderFill: palette.border,
      textFill: palette.bodyText,
    });
    expect(
      getLiveDictAreaPixiColorControlStyle({
        darkMode: false,
        editorKind: "combobox",
      }),
    ).toBeNull();
  });

  it("uses the neutral dark fallback control palette when the scene is in dark mode", () => {
    expect(
      getLiveDictAreaPixiColorControlStyle({
        darkMode: true,
        editorKind: "color-picker",
      }),
    ).toEqual({
      backgroundFill: "#111827",
      borderFill: "#334155",
      textFill: "#e5e7eb",
    });
  });
});

describe("live Pixi value control styles", () => {
  const palette = {
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
  } as const;

  it("maps combobox rows onto neutral control chrome", () => {
    expect(
      getLiveDictAreaPixiComboboxControlStyle({
        palette,
      }),
    ).toEqual({
      backgroundFill: palette.panelBackground,
      borderFill: palette.border,
      textFill: palette.bodyText,
    });
  });

  it("only exposes switch control chrome for switch-presented rows", () => {
    expect(
      getLiveDictAreaPixiSwitchControlStyle({
        palette,
        valuePresentationKind: "text",
        valueText: "true",
      }),
    ).toBeNull();
    expect(
      getLiveDictAreaPixiSwitchControlStyle({
        palette,
        valuePresentationKind: "switch",
        valueText: " TRUE ",
      }),
    ).toEqual({
      isChecked: true,
      thumbFill: palette.panelBackground,
      trackCheckedFill: palette.portSelectedDot,
      trackUncheckedFill: palette.border,
    });
    expect(
      getLiveDictAreaPixiSwitchControlStyle({
        palette,
        valuePresentationKind: "switch",
        valueText: "false",
      }),
    ).toMatchObject({
      isChecked: false,
      trackUncheckedFill: palette.border,
    });
  });
});

describe("getLiveDictAreaPixiPalette", () => {
  it("reads section-style CSS variables from the mounted host before falling back to the generic light palette", () => {
    const host = {} as Element;
    const cssVars = new Map([
      ["--setta-section-style-panel-bg", "#1f2937"],
      ["--setta-section-style-bg", "#111827"],
      ["--setta-section-style-border", "#334155"],
      ["--setta-section-style-outline", "#38bdf8"],
      ["--setta-section-style-text", "#f8fafc"],
      ["--setta-section-style-muted-text", "#94a3b8"],
    ]);
    const getComputedStyle = vi.fn(() => ({
      getPropertyValue: (propertyName: string) =>
        cssVars.get(propertyName) ?? "",
    })) as unknown as (element: Element) => CSSStyleDeclaration;

    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle,
        host,
      }),
    ).toEqual({
      bodyText: "#f8fafc",
      border: "#334155",
      panelBackground: "#1f2937",
      panelBackgroundAlt: "#111827",
      portDot: "#94a3b8",
      portSelectedDot: "#38bdf8",
      rowBackground: "#111827",
      rowBackgroundAlt: "#1f2937",
      rowPlaceholderFill: "#111827",
      titleText: "#94a3b8",
    });
  });

  it("reuses the themed panel background for row chrome when the section body background variable is unavailable", () => {
    const host = {} as Element;
    const cssVars = new Map([
      ["--setta-section-style-panel-bg", "#1f2937"],
      ["--setta-section-style-border", "#334155"],
      ["--setta-section-style-outline", "#38bdf8"],
      ["--setta-section-style-text", "#f8fafc"],
      ["--setta-section-style-muted-text", "#94a3b8"],
    ]);
    const getComputedStyle = vi.fn(() => ({
      getPropertyValue: (propertyName: string) =>
        cssVars.get(propertyName) ?? "",
    })) as unknown as (element: Element) => CSSStyleDeclaration;

    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle,
        host,
      }),
    ).toEqual({
      bodyText: "#f8fafc",
      border: "#334155",
      panelBackground: "#1f2937",
      panelBackgroundAlt: "#1f2937",
      portDot: "#94a3b8",
      portSelectedDot: "#38bdf8",
      rowBackground: "#1f2937",
      rowBackgroundAlt: "#1f2937",
      rowPlaceholderFill: "#1f2937",
      titleText: "#94a3b8",
    });
  });

  it("falls back to the generic palette when section-style CSS variables are unavailable", () => {
    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: () => "   ",
        })) as unknown as (element: Element) => CSSStyleDeclaration,
        host: {} as Element,
      }),
    ).toEqual({
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
    });
  });

  it("falls back to the section style metadata when inherited CSS variables are unavailable", () => {
    const theme = deriveSectionStyleTheme("#1f2937", false);

    expect(theme).not.toBeNull();
    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: () => "   ",
        })) as unknown as (element: Element) => CSSStyleDeclaration,
        host: {} as Element,
        sectionStyleColor: "#1f2937",
      }),
    ).toEqual({
      bodyText: theme!.text,
      border: theme!.border,
      panelBackground: theme!.panelBg,
      panelBackgroundAlt: theme!.bg,
      portDot: theme!.mutedText,
      portSelectedDot: theme!.outline,
      rowBackground: theme!.bg,
      rowBackgroundAlt: theme!.panelBg,
      rowPlaceholderFill: theme!.bg,
      titleText: theme!.mutedText,
    });
  });

  it("uses computed DOM chrome to choose a matching structured fallback palette when section variables and metadata are unavailable", () => {
    const section = {
      parentElement: null,
    } as unknown as Element;
    const host = {
      parentElement: section,
    } as unknown as Element;
    const getComputedStyle = vi.fn((element: Element) => {
      if (element === host) {
        return {
          backgroundColor: "transparent",
          borderColor: "rgba(0, 0, 0, 0)",
          color: "",
          getPropertyValue: () => "   ",
        };
      }

      return {
        backgroundColor: "rgb(16, 20, 27)",
        borderColor: "rgb(51, 65, 85)",
        color: "rgb(248, 250, 252)",
        getPropertyValue: () => "   ",
      };
    }) as unknown as (element: Element) => CSSStyleDeclaration;

    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle,
        host,
      }),
    ).toEqual({
      bodyText: "rgb(248, 250, 252)",
      border: "rgb(51, 65, 85)",
      panelBackground: "rgb(16, 20, 27)",
      panelBackgroundAlt: "rgb(16, 20, 27)",
      portDot: "#94a3b8",
      portSelectedDot: "#38bdf8",
      rowBackground: "#172036",
      rowBackgroundAlt: "#1e293b",
      rowPlaceholderFill: "#1f2937",
      titleText: "#94a3b8",
    });
  });

  it("ignores unreadable computed text colors when the nearest fallback chrome is a dark surface", () => {
    const section = {
      parentElement: null,
    } as unknown as Element;
    const host = {
      parentElement: section,
    } as unknown as Element;
    const getComputedStyle = vi.fn((element: Element) => {
      if (element === host) {
        return {
          backgroundColor: "transparent",
          borderColor: "rgba(0, 0, 0, 0)",
          color: "",
          getPropertyValue: () => "   ",
        };
      }

      return {
        backgroundColor: "rgb(16, 20, 27)",
        borderColor: "rgb(51, 65, 85)",
        color: "rgb(0, 0, 0)",
        getPropertyValue: () => "   ",
      };
    }) as unknown as (element: Element) => CSSStyleDeclaration;

    expect(
      getLiveDictAreaPixiPalette({
        darkMode: false,
        getComputedStyle,
        host,
      }),
    ).toEqual({
      bodyText: "#e5e7eb",
      border: "rgb(51, 65, 85)",
      panelBackground: "rgb(16, 20, 27)",
      panelBackgroundAlt: "rgb(16, 20, 27)",
      portDot: "#94a3b8",
      portSelectedDot: "#38bdf8",
      rowBackground: "#172036",
      rowBackgroundAlt: "#1e293b",
      rowPlaceholderFill: "#1f2937",
      titleText: "#94a3b8",
    });
  });
});

describe("getLiveDictAreaPixiTextFontFamily", () => {
  it("reads the live Pixi scene font family from the mounted host first", () => {
    const host = {} as Element;
    const fallback = {} as Element;
    const getComputedStyle = vi.fn((element: Element) => ({
      fontFamily:
        element === host
          ? '"SF Pro Text", system-ui, sans-serif'
          : '"Ignored", sans-serif',
    }));

    expect(
      getLiveDictAreaPixiTextFontFamily({
        fallbackElement: fallback,
        getComputedStyle,
        host,
      }),
    ).toBe('"SF Pro Text", system-ui, sans-serif');
  });

  it("falls back to the root element font family when the host has none", () => {
    const host = {} as Element;
    const fallback = {} as Element;
    const getComputedStyle = vi.fn((element: Element) => ({
      fontFamily: element === host ? "   " : '"Helvetica Neue", sans-serif',
    }));

    expect(
      getLiveDictAreaPixiTextFontFamily({
        fallbackElement: fallback,
        getComputedStyle,
        host,
      }),
    ).toBe('"Helvetica Neue", sans-serif');
  });

  it("uses the shared fallback stack when no computed font family is available", () => {
    expect(
      getLiveDictAreaPixiTextFontFamily({
        fallbackElement: null,
        getComputedStyle: vi.fn(() => ({ fontFamily: "   " })),
        host: null,
      }),
    ).toBe(LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY);
  });
});

describe("getLiveDictAreaPixiParamColumnWidth", () => {
  it("reads the live param column width from the mounted host CSS variable", () => {
    const host = {} as Element;
    const getComputedStyle = vi.fn(() => ({
      getPropertyValue: (propertyName: string) =>
        propertyName === "--param-column-width" ? "236px" : "",
    }));

    expect(
      getLiveDictAreaPixiParamColumnWidth({
        getComputedStyle,
        host,
      }),
    ).toBe(236);
  });

  it("falls back to the shared default width when the CSS variable is absent", () => {
    expect(
      getLiveDictAreaPixiParamColumnWidth({
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: () => "   ",
        })),
        host: {} as Element,
      }),
    ).toBe(LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH);
  });
});

describe("getLiveDictAreaPixiTextStyleSet", () => {
  it("reads the live Pixi canary text sizes and weights from matching DOM samples", () => {
    const edgeLabelElement = {} as Element;
    const edgeRowElement = {} as Element;
    const rowElement = {} as Element;
    const getComputedStyle = vi.fn((element: Element) => {
      if (element === edgeLabelElement) {
        return {
          fontSize: "8px",
          fontWeight: "700",
        } as CSSStyleDeclaration;
      }

      if (element === edgeRowElement) {
        return {
          fontSize: "10.4px",
          fontWeight: "400",
        } as CSSStyleDeclaration;
      }

      return {
        fontSize: "12px",
        fontWeight: "600",
      } as CSSStyleDeclaration;
    });

    expect(
      getLiveDictAreaPixiTextStyleSet({
        edgeLabelElement,
        edgeRowElement,
        getComputedStyle,
        rowElement,
      }),
    ).toEqual({
      edgeLabelFontSize: 8,
      edgeLabelFontWeight: "700",
      edgeRowFontSize: 10.4,
      edgeRowFontWeight: "400",
      rowFontSize: 12,
      rowFontWeight: "600",
      titleFontSize: 8,
      titleFontWeight: "700",
    });
  });

  it("falls back to the current scene text styles when DOM samples are missing", () => {
    expect(
      getLiveDictAreaPixiTextStyleSet({
        getComputedStyle: vi.fn(() => ({ fontSize: "", fontWeight: "   " })),
      }),
    ).toEqual({
      edgeLabelFontSize: 8,
      edgeLabelFontWeight: "700",
      edgeRowFontSize: 10.4,
      edgeRowFontWeight: "400",
      rowFontSize: 12,
      rowFontWeight: "600",
      titleFontSize: 8,
      titleFontWeight: "700",
    });
  });
});

describe("subscribeToLiveDictAreaPixiFontLoadInvalidation", () => {
  it("invalidates once in-flight font loads settle and again for later load events", async () => {
    let resolveReady: (() => void) | null = null;
    const loadingDoneListeners = new Set<() => void>();
    const loadingErrorListeners = new Set<() => void>();
    const invalidationSpy = vi.fn();
    const fontFaceSet = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "loadingdone") {
          loadingDoneListeners.add(listener);
        }
        if (type === "loadingerror") {
          loadingErrorListeners.add(listener);
        }
      }),
      ready: new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "loadingdone") {
          loadingDoneListeners.delete(listener);
        }
        if (type === "loadingerror") {
          loadingErrorListeners.delete(listener);
        }
      }),
      status: "loading" as const,
    };

    const unsubscribe = subscribeToLiveDictAreaPixiFontLoadInvalidation({
      fontFaceSet,
      onInvalidate: invalidationSpy,
    });

    expect(invalidationSpy).not.toHaveBeenCalled();

    resolveReady?.();
    await Promise.resolve();

    expect(invalidationSpy).toHaveBeenCalledTimes(1);

    for (const listener of loadingDoneListeners) {
      listener();
    }

    expect(invalidationSpy).toHaveBeenCalledTimes(2);

    for (const listener of loadingErrorListeners) {
      listener();
    }

    expect(invalidationSpy).toHaveBeenCalledTimes(3);

    unsubscribe();

    expect(fontFaceSet.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it("stops invalidating after cleanup", async () => {
    let resolveReady: (() => void) | null = null;
    const loadingDoneListeners = new Set<() => void>();
    const invalidationSpy = vi.fn();
    const fontFaceSet = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "loadingdone") {
          loadingDoneListeners.add(listener);
        }
      }),
      ready: new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "loadingdone") {
          loadingDoneListeners.delete(listener);
        }
      }),
      status: "loading" as const,
    };

    const unsubscribe = subscribeToLiveDictAreaPixiFontLoadInvalidation({
      fontFaceSet: fontFaceSet as unknown as FontFaceSet,
      onInvalidate: invalidationSpy,
    });

    unsubscribe();
    resolveReady?.();
    await Promise.resolve();

    for (const listener of loadingDoneListeners) {
      listener();
    }

    expect(invalidationSpy).not.toHaveBeenCalled();
  });

  it("returns a no-op cleanup when the browser does not expose FontFaceSet", () => {
    const unsubscribe = subscribeToLiveDictAreaPixiFontLoadInvalidation({
      fontFaceSet: null,
      onInvalidate: vi.fn(),
    });

    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});
