import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { describe, expect, it, vi } from "vitest";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiAvailableCanvasHeight,
  getLiveDictAreaPixiClippingContainer,
  getLiveDictAreaPixiColorControlStyle,
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiMaxCanvasHeight,
  getLiveDictAreaPixiPalette,
  getLiveDictAreaPixiParamColumnWidth,
  getLiveDictAreaPixiPresentationMode,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiTextFontFamily,
  getLiveDictAreaPixiTextResolution,
  getLiveDictAreaPixiTextStyleSet,
  getLiveDictAreaPixiUsableMaxCanvasHeight,
  LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY,
  LIVE_DICT_AREA_PIXI_FALLBACK_PARAM_COLUMN_WIDTH,
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
  it("prefers the live dict-area render shell over a taller outer section ancestor", () => {
    const section = {};
    const renderShell = {};
    const sceneRoot = {
      closest: vi.fn((selector: string) => {
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
    ).toBe(renderShell);
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
  it("scales the Pixi render resolution with viewport zoom and device pixel ratio", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 1,
      }),
    ).toBe(2);
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 1.5,
      }),
    ).toBe(3);
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 0.1,
      }),
    ).toBe(0.2);
  });

  it("falls back to sane defaults for invalid metrics", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
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

describe("getLiveDictAreaPixiColorControlStyle", () => {
  it("turns color-picker rows with real color values into structured control chrome", () => {
    expect(
      getLiveDictAreaPixiColorControlStyle({
        editorKind: "color-picker",
        valueText: "#2563eb",
      }),
    ).toEqual({
      backgroundFill: "#2563eb",
      textFill: "#f8fafc",
    });
  });

  it("uses dark text for light color-picker fills and ignores non-color controls", () => {
    expect(
      getLiveDictAreaPixiColorControlStyle({
        editorKind: "color-picker",
        valueText: "#f8fafc",
      }),
    ).toEqual({
      backgroundFill: "#f8fafc",
      textFill: "#0f172a",
    });
    expect(
      getLiveDictAreaPixiColorControlStyle({
        editorKind: "combobox",
        valueText: "#2563eb",
      }),
    ).toBeNull();
    expect(
      getLiveDictAreaPixiColorControlStyle({
        editorKind: "color-picker",
        valueText: "not-a-color",
      }),
    ).toBeNull();
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
