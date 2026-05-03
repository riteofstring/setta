import { describe, expect, it, vi } from "vitest";

import {
  drawGpuRetainedContentDateTimeControl,
  getGpuRetainedContentDateTimePrimaryText,
} from "./retainedContentDateTimeCanvas";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";

describe("retained content date/time canvas", () => {
  it("draws calendar summary text for closed calendar controls", () => {
    const ctx = createCanvasContextRecorder();
    const control = dateTimeControl({
      displayValue: "05/04/2026",
      label: "Calendar",
      mode: "date-calendar",
      summaryText: "2 selected",
    });

    drawGpuRetainedContentDateTimeControl({
      control,
      ctx,
      rect: { height: 28, width: 132, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenCalledWith(
      "2 selected",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      "Calendar",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("falls back to clock placeholders for empty time displays", () => {
    expect(
      getGpuRetainedContentDateTimePrimaryText(
        dateTimeControl({
          displayValue: "",
          mode: "time-display",
          summaryText: null,
        }),
      ),
    ).toBe("--:--");
  });
});

function dateTimeControl(
  overrides: Partial<
    Extract<GpuRetainedContentControlDescriptor, { kind: "date-time" }>
  > = {},
): Extract<GpuRetainedContentControlDescriptor, { kind: "date-time" }> {
  return {
    defaultDisplayValue: "",
    displayValue: "2026-05-04",
    kind: "date-time",
    label: "Date input",
    mode: "date-input",
    rendererFamily: "date-time",
    summaryText: null,
    commitPolicy: "native-island",
    ...overrides,
  };
}

function createCanvasContextRecorder(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
