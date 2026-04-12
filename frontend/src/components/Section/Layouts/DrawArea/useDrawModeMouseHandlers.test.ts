/* @vitest-environment jsdom */

import type { DrawAreaTransform } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  applyBrushHandleResize,
  resolveAspectRatioResizeDeltas,
} from "./useDrawModeMouseHandlers";

const baseTransform = (): DrawAreaTransform => [1, 0, 0, 1, 10, 20];

const brushBounds = {
  minX: 10,
  maxX: 110,
  minY: 20,
  maxY: 70,
};

function resizeBrushHandle(
  resizeHandleIdx: number,
  dx: number,
  dy: number,
  preserveAspectRatio = false,
): DrawAreaTransform {
  const transform = baseTransform();
  applyBrushHandleResize({
    transform,
    bounds: brushBounds,
    resizeHandleIdx,
    dx,
    dy,
    preserveAspectRatio,
  });
  return transform;
}

describe("resolveAspectRatioResizeDeltas", () => {
  it("preserves the old diagonal sign flip for mirrored handles", () => {
    expect(
      resolveAspectRatioResizeDeltas({
        dx: 0,
        dy: 5,
        aspectRatio: 2,
        resizeHandleIdx: 0,
      }),
    ).toEqual({ dx: 10, dy: 5 });

    expect(
      resolveAspectRatioResizeDeltas({
        dx: 0,
        dy: 5,
        aspectRatio: 2,
        resizeHandleIdx: 1,
      }),
    ).toEqual({ dx: -10, dy: 5 });

    expect(
      resolveAspectRatioResizeDeltas({
        dx: 6,
        dy: 1,
        aspectRatio: 2,
        resizeHandleIdx: 2,
      }),
    ).toEqual({ dx: 6, dy: -3 });
  });

  it("leaves near-zero drags unchanged", () => {
    expect(
      resolveAspectRatioResizeDeltas({
        dx: 0.0001,
        dy: 0.0002,
        aspectRatio: 2,
        resizeHandleIdx: 3,
      }),
    ).toEqual({ dx: 0.0001, dy: 0.0002 });
  });
});

describe("applyBrushHandleResize", () => {
  it("matches the prior per-handle transform math", () => {
    expect(resizeBrushHandle(0, 10, 5)).toEqual([0.9, 0, 0, 0.9, 20, 25]);
    expect(resizeBrushHandle(1, 10, 5)).toEqual([1.1, 0, 0, 0.9, 10, 25]);
    expect(resizeBrushHandle(2, 10, 5)).toEqual([0.9, 0, 0, 1.1, 20, 20]);
    expect(resizeBrushHandle(3, 10, 5)).toEqual([1.1, 0, 0, 1.1, 10, 20]);
  });

  it("uses a uniform scale when aspect ratio is preserved", () => {
    expect(resizeBrushHandle(0, 10, 2, true)).toEqual([
      0.96, 0, 0, 0.96, 14, 22,
    ]);
  });
});
