import { describe, expect, it } from "vitest";
import {
  getGpuRetainedContentRotaryKnobRect,
  getGpuRetainedContentSliderTrackRect,
  resolveGpuRetainedRotaryValueFromPoint,
  resolveGpuRetainedSliderValueFromPoint,
  snapGpuRetainedNumericControlValue,
  type GpuRetainedContentRotaryControlDescriptor,
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

  it("maps rotary pointer positions through retained knob geometry", () => {
    const control = rotaryControl({
      max: 10,
      min: 0,
      step: 2,
      value: 0,
    });
    const rect: GpuRect = { height: 28, width: 112, x: 48, y: 0 };
    const knobRect = getGpuRetainedContentRotaryKnobRect(rect);
    const center = {
      x: knobRect.x + knobRect.width / 2,
      y: knobRect.y + knobRect.height / 2,
    };

    expect(
      resolveGpuRetainedRotaryValueFromPoint({
        control,
        point: { x: knobRect.x + knobRect.width, y: center.y },
        rect,
      }),
    ).toBe(6);
    expect(
      resolveGpuRetainedRotaryValueFromPoint({
        control,
        point: { x: center.x, y: knobRect.y },
        rect,
      }),
    ).toBe(2);
    expect(
      resolveGpuRetainedRotaryValueFromPoint({
        control,
        point: { x: knobRect.x, y: center.y },
        rect,
      }),
    ).toBe(10);
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

function rotaryControl(
  overrides: Partial<GpuRetainedContentRotaryControlDescriptor>,
): GpuRetainedContentRotaryControlDescriptor {
  return {
    defaultDisplayValue: "0",
    displayValue: "0",
    kind: "rotary",
    rendererFamily: "rotary",
    commitPolicy: "preview-commit",
    max: 10,
    min: 0,
    step: 1,
    value: 0,
    ...overrides,
  };
}
