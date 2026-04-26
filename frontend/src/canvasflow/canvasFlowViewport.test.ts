import { describe, expect, it } from "vitest";
import {
  expandWorldRect,
  getVisibleWorldRect,
  panViewportByScreenDelta,
  screenToWorldPoint,
  worldToScreenPoint,
  zoomViewportAroundScreenPoint,
} from "./canvasFlowViewport";

describe("canvasFlowViewport", () => {
  it("converts between screen and world coordinates", () => {
    const viewport = { x: 40, y: -20, zoom: 2 };

    expect(screenToWorldPoint({ x: 140, y: 80 }, viewport)).toEqual({
      x: 50,
      y: 50,
    });
    expect(worldToScreenPoint({ x: 50, y: 50 }, viewport)).toEqual({
      x: 140,
      y: 80,
    });
  });

  it("pans by screen-space deltas", () => {
    expect(
      panViewportByScreenDelta({ x: 10, y: 20, zoom: 1.5 }, { x: -5, y: 8 }),
    ).toEqual({ x: 5, y: 28, zoom: 1.5 });
  });

  it("zooms around a stable pointer world position", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const next = zoomViewportAroundScreenPoint({
      viewport,
      screenPoint: { x: 200, y: 100 },
      nextZoom: 2,
    });

    expect(next).toEqual({ x: -200, y: -100, zoom: 2 });
    expect(screenToWorldPoint({ x: 200, y: 100 }, next)).toEqual({
      x: 200,
      y: 100,
    });
  });

  it("computes visible world rects and overscan", () => {
    const rect = getVisibleWorldRect(
      { cssWidth: 800, cssHeight: 400 },
      { x: -100, y: -50, zoom: 2 },
    );

    expect(rect).toEqual({ x: 50, y: 25, width: 400, height: 200 });
    expect(expandWorldRect(rect, 25)).toEqual({
      x: 25,
      y: 0,
      width: 450,
      height: 250,
    });
  });
});
