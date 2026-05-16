import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";
import {
  drawGpuRetainedContentSwitchControl,
  getGpuRetainedContentSwitchTrackRect,
} from "./retainedContentSwitchCanvas";

describe("retained content switch canvas", () => {
  it("draws the Settings switch track at the start of the value column without text", () => {
    const ctx = createCanvasContextRecorder();
    const rect = { height: 24, width: 273, x: 270, y: 0 };

    drawGpuRetainedContentSwitchControl({
      control: switchControl({ checked: true }),
      ctx,
      palette: getGpuRetainedContentCanvasPalette(true),
      rect,
      state: undefined,
    });

    expect(getGpuRetainedContentSwitchTrackRect(rect)).toEqual({
      height: 14,
      width: 34,
      x: 284,
      y: 5,
    });
    expect(ctx.fillStyles[0]).toBe("#1d4ed8");
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 292, 6);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 310, 6);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("uses the dark row thumb color for unchecked Settings-style switches", () => {
    const ctx = createCanvasContextRecorder();

    drawGpuRetainedContentSwitchControl({
      control: switchControl({ checked: false }),
      ctx,
      palette: getGpuRetainedContentCanvasPalette(true),
      rect: { height: 24, width: 273, x: 270, y: 0 },
      state: undefined,
    });

    expect(ctx.fillStyles).toEqual([
      "hsl(219, 25%, 34%)",
      "hsl(220, 26%, 14%)",
    ]);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 292, 9);
  });

  it("draws the switch thumb at an interpolated animation position", () => {
    const ctx = createCanvasContextRecorder();

    drawGpuRetainedContentSwitchControl({
      animationProgress: 0.5,
      control: switchControl({ checked: true }),
      ctx,
      palette: getGpuRetainedContentCanvasPalette(true),
      rect: { height: 24, width: 273, x: 270, y: 0 },
      state: undefined,
    });

    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 301, 9);
  });
});

function switchControl(
  overrides: Partial<
    Extract<GpuRetainedContentControlDescriptor, { kind: "switch" }>
  > = {},
): Extract<GpuRetainedContentControlDescriptor, { kind: "switch" }> {
  return {
    checked: false,
    defaultDisplayValue: "false",
    displayValue: "false",
    kind: "switch",
    rendererFamily: "switch",
    commitPolicy: "immediate",
    ...overrides,
  };
}

function createCanvasContextRecorder(): CanvasRenderingContext2D & {
  readonly fillStyles: readonly string[];
} {
  const fillStyles: string[] = [];
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fillStyles,
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
  };
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyles.at(-1) ?? "",
    set: (value: string) => {
      fillStyles.push(value);
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & {
    readonly fillStyles: readonly string[];
  };
}
