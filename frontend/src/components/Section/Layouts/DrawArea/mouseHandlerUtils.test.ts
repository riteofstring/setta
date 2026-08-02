/* @vitest-environment jsdom */

import type { DrawAreaTransform } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getImageHandleBehaviorFn } from "./mouseHandlerUtils";

const baseTransform = (): DrawAreaTransform => [1, 0, 0, 1, 10, 20];

function applyImageHandleBehavior(
  resizeHandleIdx: number,
  xScaleWasPositive: boolean,
  yScaleWasPositive: boolean,
): DrawAreaTransform {
  const transform = baseTransform();
  const image = document.createElement("img");
  image.width = 100;
  image.height = 50;

  getImageHandleBehaviorFn(
    resizeHandleIdx,
    xScaleWasPositive,
    yScaleWasPositive,
  )(transform, 100, 50, 10, 5, { value: image });

  return transform;
}

describe("getImageHandleBehaviorFn", () => {
  it("maps handle orientation through mirrored axes", () => {
    expect(applyImageHandleBehavior(0, true, true)).toEqual([
      0.9, 0, 0, 0.9, 20, 25,
    ]);
    expect(applyImageHandleBehavior(0, false, true)).toEqual([
      1.1, 0, 0, 0.9, 10, 25,
    ]);
    expect(applyImageHandleBehavior(0, true, false)).toEqual([
      0.9, 0, 0, 1.1, 20, 20,
    ]);
    expect(applyImageHandleBehavior(0, false, false)).toEqual([
      1.1, 0, 0, 1.1, 10, 20,
    ]);

    expect(applyImageHandleBehavior(1, true, true)).toEqual([
      1.1, 0, 0, 0.9, 10, 25,
    ]);
    expect(applyImageHandleBehavior(1, false, true)).toEqual([
      0.9, 0, 0, 0.9, 20, 25,
    ]);
    expect(applyImageHandleBehavior(1, true, false)).toEqual([
      1.1, 0, 0, 1.1, 10, 20,
    ]);
    expect(applyImageHandleBehavior(1, false, false)).toEqual([
      0.9, 0, 0, 1.1, 20, 20,
    ]);

    expect(applyImageHandleBehavior(2, true, true)).toEqual([
      0.9, 0, 0, 1.1, 20, 20,
    ]);
    expect(applyImageHandleBehavior(2, false, true)).toEqual([
      1.1, 0, 0, 1.1, 10, 20,
    ]);
    expect(applyImageHandleBehavior(2, true, false)).toEqual([
      0.9, 0, 0, 0.9, 20, 25,
    ]);
    expect(applyImageHandleBehavior(2, false, false)).toEqual([
      1.1, 0, 0, 0.9, 10, 25,
    ]);

    expect(applyImageHandleBehavior(3, true, true)).toEqual([
      1.1, 0, 0, 1.1, 10, 20,
    ]);
    expect(applyImageHandleBehavior(3, false, true)).toEqual([
      0.9, 0, 0, 1.1, 20, 20,
    ]);
    expect(applyImageHandleBehavior(3, true, false)).toEqual([
      1.1, 0, 0, 0.9, 10, 25,
    ]);
    expect(applyImageHandleBehavior(3, false, false)).toEqual([
      0.9, 0, 0, 0.9, 20, 25,
    ]);
  });

  it("falls back to the top-left behavior for unknown handles", () => {
    expect(applyImageHandleBehavior(99, true, true)).toEqual([
      0.9, 0, 0, 0.9, 20, 25,
    ]);
  });
});
