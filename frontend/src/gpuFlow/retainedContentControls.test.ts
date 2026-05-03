import { describe, expect, it } from "vitest";
import {
  getGpuRetainedContentSliderTrackRect,
  resolveGpuRetainedSliderValueFromPoint,
  snapGpuRetainedNumericControlValue,
  type GpuRetainedContentSliderControlDescriptor,
} from "./retainedContentControls";
import type { GpuRect } from "./viewportMath";

describe("retained content controls", () => {
  it("maps slider pointer positions through retained track geometry", () => {
    const control = sliderControl({
      max: 10,
      min: 0,
      step: 2,
      value: 0,
    });
    const rect: GpuRect = { height: 28, width: 112, x: 48, y: 0 };
    const trackRect = getGpuRetainedContentSliderTrackRect(rect);

    expect(
      resolveGpuRetainedSliderValueFromPoint({
        control,
        point: { x: trackRect.x + trackRect.width * 0.55, y: 14 },
        rect,
      }),
    ).toBe(6);
    expect(
      resolveGpuRetainedSliderValueFromPoint({
        control,
        point: { x: trackRect.x - 100, y: 14 },
        rect,
      }),
    ).toBe(0);
    expect(
      resolveGpuRetainedSliderValueFromPoint({
        control,
        point: { x: trackRect.x + trackRect.width + 100, y: 14 },
        rect,
      }),
    ).toBe(10);
  });

  it("snaps numeric controls to finite step precision", () => {
    expect(
      snapGpuRetainedNumericControlValue({
        max: 1,
        min: 0,
        step: 0.25,
        value: 0.62,
      }),
    ).toBe(0.5);
  });
});

function sliderControl(
  overrides: Partial<GpuRetainedContentSliderControlDescriptor>,
): GpuRetainedContentSliderControlDescriptor {
  return {
    defaultDisplayValue: "0",
    displayValue: "0",
    kind: "slider",
    rendererFamily: "slider",
    commitPolicy: "preview-commit",
    max: 10,
    min: 0,
    step: 1,
    value: 0,
    ...overrides,
  };
}
