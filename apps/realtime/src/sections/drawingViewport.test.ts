import { describe, expect, it } from "vitest";

import {
  createDrawingViewport,
  getDrawingViewportPresentation,
  resizeDrawingViewportLogical,
  resizeDrawingViewportStage,
} from "./drawingViewport";

describe("drawing viewport", () => {
  it("contain-fits a logical canvas without changing its identity", () => {
    const viewport = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 200, width: 160 },
    );

    expect(viewport).toEqual({
      logicalSize: { height: 240, width: 320 },
      scale: 0.5,
      stageSize: { height: 200, width: 160 },
    });
    expect(getDrawingViewportPresentation(viewport)).toEqual({
      displayHeight: 120,
      displayWidth: 160,
      scale: 0.5,
    });
  });

  it("recomputes its fit after stage and logical canvas resize", () => {
    const initial = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 200, width: 160 },
    );
    const widerStage = resizeDrawingViewportStage(initial, {
      height: 300,
      width: 400,
    });
    const largerCanvas = resizeDrawingViewportLogical(widerStage, {
      height: 600,
      width: 400,
    });

    expect(widerStage.scale).toBe(1.25);
    expect(largerCanvas.scale).toBe(0.5);
    expect(largerCanvas.logicalSize).toEqual({ height: 600, width: 400 });
  });

  it("handles an unmeasurable stage without non-finite values", () => {
    const hidden = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 0, width: 0 },
    );

    expect(getDrawingViewportPresentation(hidden)).toEqual({
      displayHeight: 0,
      displayWidth: 0,
      scale: 0,
    });
    const visible = resizeDrawingViewportStage(hidden, {
      height: 120,
      width: 160,
    });
    expect(getDrawingViewportPresentation(visible)).toEqual({
      displayHeight: 120,
      displayWidth: 160,
      scale: 0.5,
    });
  });

  it("returns the same snapshot for semantic no-ops", () => {
    const fitted = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );

    expect(
      resizeDrawingViewportStage(fitted, { height: 120, width: 160 }),
    ).toBe(fitted);
    expect(
      resizeDrawingViewportLogical(fitted, { height: 240, width: 320 }),
    ).toBe(fitted);
  });

  it("rejects invalid geometry", () => {
    expect(() =>
      createDrawingViewport(
        { height: 0, width: 320 },
        { height: 120, width: 160 },
      ),
    ).toThrow(RangeError);
    expect(() =>
      createDrawingViewport(
        { height: 240, width: 320 },
        { height: -1, width: 160 },
      ),
    ).toThrow(RangeError);
  });
});
