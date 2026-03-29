import { describe, expect, it, vi } from "vitest";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiTextStyleSet,
  getLiveDictAreaPixiTextFontFamily,
  LIVE_DICT_AREA_PIXI_FALLBACK_FONT_FAMILY,
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

describe("getLiveDictAreaPixiTextStyleSet", () => {
  it("matches the current dict-area DOM text sizes for the live Pixi canary", () => {
    expect(getLiveDictAreaPixiTextStyleSet()).toEqual({
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
