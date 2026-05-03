import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import {
  drawGpuRetainedContentColorPickerControl,
  getGpuRetainedContentColorPickerOuterRect,
} from "./retainedContentColorPickerCanvas";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";

describe("retained content color picker canvas", () => {
  it("draws native color picker idle state as a full Settings swatch", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);
    const rect = { height: 24, width: 273, x: 270, y: 0 };

    drawGpuRetainedContentColorPickerControl({
      control: colorPickerControl({ choices: [] }),
      ctx,
      palette,
      rect,
      state: undefined,
    });

    expect(getGpuRetainedContentColorPickerOuterRect(rect, palette)).toEqual({
      height: 14,
      width: 257,
      x: 284,
      y: 5,
    });
    expect(ctx.fillStylesAtFill[0]).toBe("#ff0000");
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("draws configured color choices as a full Settings swatch with text overlay", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentColorPickerControl({
      control: colorPickerControl({
        choices: [{ color: "#afbacf", description: "Grid" }],
        displayValue: "#afbacf",
        selectedIndex: 0,
      }),
      ctx,
      palette,
      rect: { height: 24, width: 273, x: 270, y: 0 },
      state: undefined,
    });

    expect(ctx.fillStylesAtFill[0]).toBe("#afbacf");
    expect(ctx.fillText).toHaveBeenCalledWith("Grid", 297, 12, 223);
  });
});

function colorPickerControl(
  overrides: Partial<
    Extract<GpuRetainedContentControlDescriptor, { kind: "color-picker" }>
  > = {},
): Extract<GpuRetainedContentControlDescriptor, { kind: "color-picker" }> {
  return {
    choices: [],
    defaultDisplayValue: "#ff0000",
    displayValue: "#ff0000",
    kind: "color-picker",
    rendererFamily: "color-picker",
    commitPolicy: "native-island",
    selectedIndex: null,
    ...overrides,
  };
}

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly arc: ReturnType<typeof vi.fn>;
  readonly fillStylesAtFill: string[];
  readonly fillText: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder(): MockCanvasContext {
  let fillStyle = "";
  const fillStylesAtFill: string[] = [];
  const ctx = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => {
      fillStylesAtFill.push(fillStyle);
    }),
    fillStylesAtFill,
    fillText: vi.fn(),
    font: "",
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    lineWidth: 0,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyle,
    set: (value: string) => {
      fillStyle = value;
    },
  });
  return ctx;
}
