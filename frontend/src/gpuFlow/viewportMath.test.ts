import { describe, expect, it } from "vitest";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  rectsIntersect,
  screenToFlowPosition,
} from "./viewportMath";

describe("gpu viewport math", () => {
  it("converts between flow and screen coordinates using the Setta viewport", () => {
    const viewport = [20, -10, 2] as const;
    const screen = flowToScreenPosition({ x: 15, y: 25 }, viewport);

    expect(screen).toEqual({ x: 50, y: 40 });
    expect(screenToFlowPosition(screen, viewport)).toEqual({ x: 15, y: 25 });
  });

  it("computes the visible flow rect with a CSS-pixel margin", () => {
    expect(
      getVisibleFlowRect({
        canvasHeight: 300,
        canvasWidth: 500,
        marginCssPx: 50,
        viewport: { x: 100, y: 80, zoom: 2 },
      }),
    ).toEqual({
      height: 200,
      width: 300,
      x: -75,
      y: -65,
    });
  });

  it("detects rect intersection without counting touching edges", () => {
    expect(
      rectsIntersect(
        { height: 20, width: 20, x: 10, y: 10 },
        { height: 10, width: 10, x: 29, y: 29 },
      ),
    ).toBe(true);
    expect(
      rectsIntersect(
        { height: 20, width: 20, x: 10, y: 10 },
        { height: 10, width: 10, x: 30, y: 30 },
      ),
    ).toBe(false);
  });
});
