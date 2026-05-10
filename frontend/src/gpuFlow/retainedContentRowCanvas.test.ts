import { describe, expect, it, vi } from "vitest";

import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import {
  drawGpuRetainedContentLabel,
  drawGpuRetainedContentRowBackground,
} from "./retainedContentRowCanvas";
import type { GpuRetainedContentRowState } from "./retainedContentScene";

describe("retained content row canvas", () => {
  it("draws muted monospace labels with the retained param-name inset", () => {
    const ctx = canvasContext();

    drawGpuRetainedContentLabel({
      appearance: {
        fontFamily: "mono",
        fontWeight: "normal",
        tone: "muted",
      },
      ctx: ctx as unknown as CanvasRenderingContext2D,
      palette,
      rect: { height: 24, width: 100, x: 2, y: 4 },
      state: undefined,
      text: "Add Key",
    });

    expect(ctx.font).toContain("12px ui-monospace");
    expect(ctx.fillStyle).toBe(palette.labelMutedText);
    expect(ctx.fillText).toHaveBeenCalledWith("Add Key", 17, 19, 100);
  });

  it("draws semibold sans labels for display-name rows", () => {
    const ctx = canvasContext();

    drawGpuRetainedContentLabel({
      appearance: {
        fontFamily: "sans",
        fontWeight: "semibold",
        tone: "default",
      },
      ctx: ctx as unknown as CanvasRenderingContext2D,
      palette,
      rect: { height: 24, width: 120, x: 0, y: 0 },
      state: undefined,
      text: "Display Label",
    });

    expect(ctx.font).toContain("600 12px ui-sans-serif");
    expect(ctx.fillStyle).toBe(palette.labelText);
    expect(ctx.fillText).toHaveBeenCalledWith("Display Label", 15, 14, 120);
  });

  it("draws CSS-like ellipsis when display-name rows exceed the label width", () => {
    const ctx = canvasContext({ textWidth: (text) => text.length * 10 });

    drawGpuRetainedContentLabel({
      appearance: {
        fontFamily: "sans",
        fontWeight: "semibold",
        tone: "default",
      },
      ctx: ctx as unknown as CanvasRenderingContext2D,
      palette,
      rect: { height: 24, width: 82, x: 0, y: 0 },
      state: undefined,
      text: "Extra Long Display Label",
    });

    expect(ctx.fillText).toHaveBeenCalledWith("Extra L\u2026", 15, 14, 82);
  });

  it("does not draw row focus treatment for canvas-owned control focus", () => {
    const ctx = canvasContext();

    drawGpuRetainedContentRowBackground({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dividerRects: [],
      palette,
      rect: { height: 24, width: 120, x: 0, y: 0 },
      state: rowState({ controlFocused: true }),
    });

    expect(ctx.fillStyles[0]).toBe(palette.rowBackground);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it("draws row focus treatment for DOM-island focus", () => {
    const ctx = canvasContext();

    drawGpuRetainedContentRowBackground({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dividerRects: [],
      palette,
      rect: { height: 24, width: 120, x: 0, y: 0 },
      state: rowState({ focused: true }),
    });

    expect(ctx.fillStyles[0]).toBe(palette.rowFocusedBackground);
    expect(ctx.strokeStyles).toContain(palette.focusRing);
    expect(ctx.strokeRect).toHaveBeenCalledWith(0.5, 0.5, 119, 23);
  });
});

const palette: GpuRetainedContentCanvasPalette = {
  disabledText: "#disabled",
  errorAccent: "#error",
  focusRing: "#focus",
  labelAccentText: "#accent",
  labelMutedText: "#muted",
  labelText: "#label",
  nestGuide: "#nest",
  rowBackground: "#row",
  rowDivider: "#divider",
  rowDraggingBackground: "#dragging",
  rowErrorBackground: "#row-error",
  rowFocusedBackground: "#focused",
  rowHoverBackground: "#hover",
  rowSelectedBackground: "#selected",
  searchFocusedRing: "#search-focused",
  searchRing: "#search",
  surfaceBackground: "#surface",
  textLikeBackground: "#text-like",
  textLikeBorder: "#text-like-border",
  textLikeDisabledBackground: "#text-like-disabled",
  textLikeDisabledText: "#text-like-disabled-text",
  textLikeFocusedBorder: "#text-like-focused",
  textLikeSelectedBorder: "#text-like-selected",
  textLikeText: "#text-like-text",
  textLikeVisualStyle: "row-text",
};

function canvasContext({
  textWidth = (text: string) => text.length * 6,
}: {
  readonly textWidth?: (text: string) => number;
} = {}) {
  const context = {
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillStyles: [] as string[],
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    measureText: vi.fn((text: string) => ({ width: textWidth(text) })),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyles: [] as string[],
    strokeStyle: "",
    textBaseline: "alphabetic",
  };
  Object.defineProperty(context, "fillStyle", {
    get: () => context.fillStyles.at(-1) ?? "",
    set: (value: string) => {
      context.fillStyles.push(value);
    },
  });
  Object.defineProperty(context, "strokeStyle", {
    get: () => context.strokeStyles.at(-1) ?? "",
    set: (value: string) => {
      context.strokeStyles.push(value);
    },
  });
  return context;
}

function rowState(
  overrides: Partial<GpuRetainedContentRowState> = {},
): GpuRetainedContentRowState {
  return {
    controlFocused: false,
    disabled: false,
    dragging: false,
    error: false,
    focused: false,
    hovered: false,
    nativeControlActive: false,
    nativeLabelActive: false,
    searchFocused: false,
    searchMatched: false,
    selected: false,
    ...overrides,
  };
}
