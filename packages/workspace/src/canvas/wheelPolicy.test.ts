/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
  NATIVE_VERTICAL_WHEEL_CLASS_NAME,
} from "../interaction.js";
import { resolveWheelTargetDisposition } from "./wheelPolicy.js";

function disposition({
  classNames,
  deltaX,
  deltaY,
  isMacOS = true,
  shiftKey = false,
}: {
  classNames: string;
  deltaX: number;
  deltaY: number;
  isMacOS?: boolean;
  shiftKey?: boolean;
}) {
  const wrapper = document.createElement("div");
  const target = document.createElement("span");
  wrapper.className = classNames;
  wrapper.append(target);
  const event = new WheelEvent("wheel", { deltaX, deltaY, shiftKey });
  Object.defineProperty(event, "target", { value: target });
  return resolveWheelTargetDisposition({
    event,
    isMacOS,
    isPanScrolling: false,
    zoomActivationKeyPressed: false,
    zoomOnPinch: true,
  });
}

describe("wheel target policy", () => {
  it("gives an overflowing editor only its vertical axis", () => {
    expect(
      disposition({
        classNames: NATIVE_VERTICAL_WHEEL_CLASS_NAME,
        deltaX: 2,
        deltaY: 20,
      }),
    ).toBe("native");
    expect(
      disposition({
        classNames: NATIVE_VERTICAL_WHEEL_CLASS_NAME,
        deltaX: 20,
        deltaY: 2,
      }),
    ).toBe("canvas");
  });

  it("gives an overflowing editor only its horizontal axis", () => {
    expect(
      disposition({
        classNames: NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
        deltaX: 20,
        deltaY: 2,
      }),
    ).toBe("native");
    expect(
      disposition({
        classNames: NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
        deltaX: 2,
        deltaY: 20,
      }),
    ).toBe("canvas");
  });

  it("treats non-Mac Shift-wheel as horizontal editor input", () => {
    expect(
      disposition({
        classNames: NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
        deltaX: 0,
        deltaY: 20,
        isMacOS: false,
        shiftKey: true,
      }),
    ).toBe("native");
  });
});
