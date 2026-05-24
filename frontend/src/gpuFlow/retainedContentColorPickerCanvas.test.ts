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
      y: 7,
    });
    expect(ctx.fillStylesAtFill[0]).toBe("#ff0000");
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(ctx.translate).toHaveBeenCalledWith(412, 14.5);
    expect(ctx.moveTo).toHaveBeenCalledWith(-1.4, -2.8);
    expect(ctx.lineTo).toHaveBeenCalledWith(0, 4.8);
    expect(ctx.fillRect).toHaveBeenCalledWith(-2, -5, 4, 2.6);
    expect(ctx.lineWidth).toBe(1.1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
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
    expect(ctx.fillText).toHaveBeenCalledWith("Grid", 297, 14, 223);
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
  readonly fillStylesAtFill: string[];
  readonly fillRect: ReturnType<typeof vi.fn>;
  readonly fillText: ReturnType<typeof vi.fn>;
  lineWidth: number;
  readonly restore: ReturnType<typeof vi.fn>;
  readonly rotate: ReturnType<typeof vi.fn>;
  readonly save: ReturnType<typeof vi.fn>;
  readonly translate: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder(): MockCanvasContext {
  let fillStyle = "";
  const fillStylesAtFill: string[] = [];
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => {
      fillStylesAtFill.push(fillStyle);
    }),
    fillStylesAtFill,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    font: "",
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    lineWidth: 0,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    translate: vi.fn(),
  } as unknown as MockCanvasContext;
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyle,
    set: (value: string) => {
      fillStyle = value;
    },
  });
  return ctx;
}
