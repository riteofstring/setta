import { describe, expect, it } from "vitest";
import {
  getGpuRetainedContentRangedControlKeyboardCommand,
  getGpuRetainedContentRangedControlWheelCommand,
  getGpuRetainedContentRotaryKnobRect,
  getGpuRetainedContentSliderTrackRect,
  isGpuRetainedContentSwitchKeyboardToggle,
  resolveGpuRetainedRangedControlCommandValue,
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

  it("resolves ranged keyboard commands through retained numeric step math", () => {
    const control = sliderControl({
      max: 10,
      min: 0,
      step: 0.5,
      value: 4,
    });

    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getKeyboardCommand("ArrowRight"),
        control,
      }),
    ).toBe(4.5);
    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getKeyboardCommand("PageUp"),
        control,
      }),
    ).toBe(9);
    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getKeyboardCommand("Home"),
        control,
      }),
    ).toBe(0);
    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getKeyboardCommand("End"),
        control,
      }),
    ).toBe(10);
  });

  it("resolves ranged wheel commands from the dominant wheel axis", () => {
    const control = rotaryControl({
      max: 10,
      min: 0,
      step: 1,
      value: 5,
    });

    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getWheelCommand({ deltaX: 0, deltaY: -24 }),
        control,
      }),
    ).toBe(6);
    expect(
      resolveGpuRetainedRangedControlCommandValue({
        command: getWheelCommand({ deltaX: 30, deltaY: 2 }),
        control,
      }),
    ).toBe(4);
  });

  it("recognizes retained switch keyboard activation", () => {
    expect(
      isGpuRetainedContentSwitchKeyboardToggle({
        code: "Space",
        key: "Spacebar",
      }),
    ).toBe(true);
    expect(
      isGpuRetainedContentSwitchKeyboardToggle({ code: "Enter", key: "Enter" }),
    ).toBe(true);
    expect(
      isGpuRetainedContentSwitchKeyboardToggle({ code: "KeyA", key: "a" }),
    ).toBe(false);
  });
});

function getKeyboardCommand(key: string) {
  const command = getGpuRetainedContentRangedControlKeyboardCommand({ key });
  if (!command) {
    throw new Error(`Expected retained keyboard command for ${key}.`);
  }
  return command;
}

function getWheelCommand({
  deltaX,
  deltaY,
}: {
  readonly deltaX: number;
  readonly deltaY: number;
}) {
  const command = getGpuRetainedContentRangedControlWheelCommand({
    deltaX,
    deltaY,
  });
  if (!command) {
    throw new Error("Expected retained wheel command.");
  }
  return command;
}

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
