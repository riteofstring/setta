import { describe, expect, it, vi } from "vitest";

import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import { drawGpuRetainedContentLabel } from "./retainedContentRowCanvas";

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
    expect(ctx.fillText).toHaveBeenCalledWith("Add Key", 17, 19, 70);
  });

  it("draws default sans labels for display-name rows", () => {
    const ctx = canvasContext();

    drawGpuRetainedContentLabel({
      appearance: {
        fontFamily: "sans",
        fontWeight: "normal",
        tone: "default",
      },
      ctx: ctx as unknown as CanvasRenderingContext2D,
      palette,
      rect: { height: 24, width: 120, x: 0, y: 0 },
      state: undefined,
      text: "Display Label",
    });

    expect(ctx.font).toContain("12px Inter");
    expect(ctx.fillStyle).toBe(palette.labelText);
    expect(ctx.fillText).toHaveBeenCalledWith("Display Label", 15, 13, 90);
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
  textLikeCodeAtomText: "#text-like-code-atom",
  textLikeCodeNumberText: "#text-like-code-number",
  textLikeDisabledBackground: "#text-like-disabled",
  textLikeDisabledText: "#text-like-disabled-text",
  textLikeFocusedBorder: "#text-like-focused",
  textLikeSelectedBorder: "#text-like-selected",
  textLikeText: "#text-like-text",
  textLikeVisualStyle: "row-text",
};

function canvasContext() {
  return {
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    textBaseline: "alphabetic",
  };
}
