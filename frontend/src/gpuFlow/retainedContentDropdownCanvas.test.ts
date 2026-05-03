import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import {
  drawGpuRetainedContentDropdownControl,
  getGpuRetainedContentDropdownOuterRect,
} from "./retainedContentDropdownCanvas";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";

describe("retained content dropdown canvas", () => {
  it("uses the dark Settings row-text field instead of a light native field", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);
    const rect = { height: 24, width: 273, x: 270, y: 0 };

    drawGpuRetainedContentDropdownControl({
      control: dropdownControl(),
      ctx,
      palette,
      rect,
      state: undefined,
    });

    expect(getGpuRetainedContentDropdownOuterRect(rect, palette)).toEqual({
      height: 16,
      width: 255,
      x: 286,
      y: 6,
    });
    expect(ctx.fillStyleAssignments).toContain("#0b0e13");
    expect(ctx.fillStyleAssignments).not.toContain("#ffffff");
    expect(ctx.fillText).toHaveBeenCalledWith("ALWAYS_ASK", 299, 14, 226);
  });
});

function dropdownControl(): Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "dropdown" }
> {
  return {
    choices: [{ label: "ALWAYS_ASK", value: "ALWAYS_ASK" }],
    defaultDisplayValue: "ALWAYS_ASK",
    displayValue: "ALWAYS_ASK",
    kind: "dropdown",
    rendererFamily: "dropdown",
    commitPolicy: "immediate",
    selectedIndex: 0,
  };
}

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly fillStyleAssignments: string[];
  readonly fillText: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder(): MockCanvasContext {
  const fillStyleAssignments: string[] = [];
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
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
    fillStyleAssignments,
  } as unknown as MockCanvasContext;
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyleAssignments.at(-1) ?? "",
    set: (value: string) => {
      fillStyleAssignments.push(value);
    },
  });
  return ctx;
}
