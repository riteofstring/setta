import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";
import {
  drawGpuRetainedContentSwitchControl,
  getGpuRetainedContentSwitchTrackRect,
} from "./retainedContentSwitchCanvas";

describe("retained content switch canvas", () => {
  it("draws the switch track at the start of the value column without text", () => {
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
    expect(ctx.fillText).not.toHaveBeenCalled();
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

function createCanvasContextRecorder(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
