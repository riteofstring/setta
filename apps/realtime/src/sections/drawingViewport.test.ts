import { describe, expect, it } from "vitest";

import {
  actualSizeDrawingViewport,
  createDrawingViewport,
  DRAWING_VIEWPORT_MAXIMUM_SCALE,
  DRAWING_VIEWPORT_MINIMUM_SCALE,
  fitDrawingViewport,
  getDrawingViewportPresentation,
  panDrawingViewport,
  resizeDrawingViewportLogical,
  resizeDrawingViewportStage,
  setDrawingViewportZoom,
  stepDrawingViewportZoom,
} from "./drawingViewport";

describe("drawing viewport", () => {
  it("contain-fits a logical canvas without changing its identity", () => {
    const viewport = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 200, width: 160 },
    );

    expect(viewport).toEqual({
      logicalSize: { height: 240, width: 320 },
      mode: "fit",
      pan: { x: 0, y: 0 },
      scale: 0.5,
      stageSize: { height: 200, width: 160 },
    });
    expect(getDrawingViewportPresentation(viewport)).toEqual({
      canZoomIn: true,
      canZoomOut: true,
      displayHeight: 120,
      displayWidth: 160,
      maximumPanX: 0,
      maximumPanY: 0,
      mode: "fit",
      panX: 0,
      panY: 0,
      scale: 0.5,
      zoomPercent: 50,
    });
  });

  it("supports actual size, custom bounded zoom, and reversible zoom steps", () => {
    const fitted = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );
    const actual = actualSizeDrawingViewport(fitted);
    const zoomedIn = stepDrawingViewportZoom(actual, "in");
    const zoomedBack = stepDrawingViewportZoom(zoomedIn, "out");

    expect(getDrawingViewportPresentation(actual)).toMatchObject({
      displayHeight: 240,
      displayWidth: 320,
      mode: "custom",
      scale: 1,
      zoomPercent: 100,
    });
    expect(zoomedIn.scale).toBe(1.2);
    expect(zoomedBack.scale).toBe(1);
    expect(setDrawingViewportZoom(actual, Number.MAX_SAFE_INTEGER).scale).toBe(
      DRAWING_VIEWPORT_MAXIMUM_SCALE,
    );
    expect(setDrawingViewportZoom(actual, 0.001).scale).toBe(
      DRAWING_VIEWPORT_MINIMUM_SCALE,
    );
  });

  it("keeps a fitted scale reachable outside nominal custom zoom bounds", () => {
    const tinyFit = createDrawingViewport(
      { height: 8192, width: 8192 },
      { height: 64, width: 64 },
    );
    const largeFit = createDrawingViewport(
      { height: 1, width: 1 },
      { height: 20, width: 20 },
    );

    expect(tinyFit.scale).toBe(0.0078125);
    expect(getDrawingViewportPresentation(tinyFit).displayWidth).toBe(64);
    expect(stepDrawingViewportZoom(tinyFit, "out")).toBe(tinyFit);
    expect(stepDrawingViewportZoom(tinyFit, "in").scale).toBe(0.009375);
    expect(largeFit.scale).toBe(20);
    expect(stepDrawingViewportZoom(largeFit, "in")).toBe(largeFit);
    expect(stepDrawingViewportZoom(largeFit, "out").scale).toBe(16.666667);
  });

  it("clamps pan so overflowing canvas edges remain reachable", () => {
    const actual = actualSizeDrawingViewport(
      createDrawingViewport(
        { height: 240, width: 320 },
        { height: 120, width: 160 },
      ),
    );
    const panned = panDrawingViewport(actual, { x: 10_000, y: -10_000 });

    expect(panned.pan).toEqual({ x: 80, y: -60 });
    expect(getDrawingViewportPresentation(panned)).toMatchObject({
      maximumPanX: 80,
      maximumPanY: 60,
      panX: 80,
      panY: -60,
    });
    expect(panDrawingViewport(panned, { x: 1, y: -1 })).toBe(panned);
  });

  it("reclamps pan after stage and zoom changes", () => {
    const panned = panDrawingViewport(
      actualSizeDrawingViewport(
        createDrawingViewport(
          { height: 240, width: 320 },
          { height: 120, width: 160 },
        ),
      ),
      { x: 80, y: 60 },
    );
    const widerStage = resizeDrawingViewportStage(panned, {
      height: 220,
      width: 300,
    });
    const zoomedOut = setDrawingViewportZoom(panned, 0.5);

    expect(widerStage.pan).toEqual({ x: 10, y: 10 });
    expect(zoomedOut.pan).toEqual({ x: 0, y: 0 });
  });

  it("recomputes fit after stage and logical canvas resize", () => {
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

  it("preserves custom scale across resize while it remains in bounds", () => {
    const custom = setDrawingViewportZoom(
      createDrawingViewport(
        { height: 240, width: 320 },
        { height: 200, width: 160 },
      ),
      1.75,
    );
    const resizedStage = resizeDrawingViewportStage(custom, {
      height: 500,
      width: 500,
    });
    const resizedLogical = resizeDrawingViewportLogical(resizedStage, {
      height: 300,
      width: 400,
    });

    expect(resizedStage.scale).toBe(1.75);
    expect(resizedLogical.scale).toBe(1.75);
    expect(resizedLogical.mode).toBe("custom");
  });

  it("handles an unmeasurable stage without non-finite presentation values", () => {
    const hidden = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 0, width: 0 },
    );

    expect(getDrawingViewportPresentation(hidden)).toEqual({
      canZoomIn: true,
      canZoomOut: false,
      displayHeight: 0,
      displayWidth: 0,
      maximumPanX: 0,
      maximumPanY: 0,
      mode: "fit",
      panX: 0,
      panY: 0,
      scale: 0,
      zoomPercent: 0,
    });
    const visible = resizeDrawingViewportStage(hidden, {
      height: 120,
      width: 160,
    });
    expect(visible.scale).toBe(0.5);
    expect(getDrawingViewportPresentation(visible).displayWidth).toBe(160);
  });

  it("returns the same snapshot for semantic no-ops", () => {
    const fitted = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );

    expect(fitDrawingViewport(fitted)).toBe(fitted);
    expect(
      resizeDrawingViewportStage(fitted, { height: 120, width: 160 }),
    ).toBe(fitted);
    expect(
      resizeDrawingViewportLogical(fitted, { height: 240, width: 320 }),
    ).toBe(fitted);
    expect(panDrawingViewport(fitted, { x: 10, y: 10 })).toBe(fitted);
  });

  it("rejects invalid geometry and custom scale values", () => {
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
    const fitted = createDrawingViewport(
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );
    expect(() => setDrawingViewportZoom(fitted, Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => panDrawingViewport(fitted, { x: Infinity, y: 0 })).toThrow(
      RangeError,
    );
  });
});
