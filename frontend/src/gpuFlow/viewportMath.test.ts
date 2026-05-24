import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  flowToScreenPosition,
  getGpuViewportForBounds,
  getVisibleFlowRect,
  panGpuViewportBy,
  rectsIntersect,
  screenToFlowPosition,
  zoomGpuViewportAtScreenPoint,
} from "./viewportMath";

const GPU_MATH_PROPERTY_RUNS = 100;
const coordinate = fc.double({
  max: 100_000,
  min: -100_000,
  noDefaultInfinity: true,
  noNaN: true,
});
const positiveDimension = fc.double({
  max: 10_000,
  min: 1,
  noDefaultInfinity: true,
  noNaN: true,
});
const nonNegativeDimension = fc.oneof(fc.constant(0), positiveDimension);
const zoomValue = fc.double({
  max: 8,
  min: 0.05,
  noDefaultInfinity: true,
  noNaN: true,
});

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

  it("keeps a screen point stable when zooming the GPU viewport", () => {
    expect(
      zoomGpuViewportAtScreenPoint({
        maxZoom: 4,
        minZoom: 0.25,
        point: { x: 100, y: 80 },
        viewport: [0, 0, 1],
        zoom: 2,
      }),
    ).toEqual({
      x: -100,
      y: -80,
      zoom: 2,
    });
  });

  it("pans the viewport by screen-space deltas", () => {
    expect(panGpuViewportBy([10, 20, 2], { x: 5, y: -4 })).toEqual({
      x: 15,
      y: 16,
      zoom: 2,
    });
  });

  it("centers fit bounds into the visible pane offset", () => {
    expect(
      getGpuViewportForBounds(
        { height: 50, width: 100, x: 10, y: 20 },
        {
          canvasHeight: 200,
          canvasWidth: 400,
          maxZoom: 4,
          minZoom: 0.25,
          overviewWidth: 120,
          padding: 0,
        },
      ),
    ).toEqual({
      x: 80,
      y: -80,
      zoom: 4,
    });
  });

  it("resolves fit bounds without depending on d3", () => {
    expect(
      getGpuViewportForBounds(
        { height: 50, width: 100, x: 10, y: 20 },
        {
          canvasHeight: 200,
          canvasWidth: 400,
          maxZoom: 4,
          minZoom: 0.25,
          padding: 0,
        },
      ),
    ).toEqual({
      x: -40,
      y: -80,
      zoom: 4,
    });
  });

  it("round-trips finite flow and screen coordinates", () => {
    fc.assert(
      fc.property(
        fc.record({
          point: fc.record({ x: coordinate, y: coordinate }),
          viewport: fc.record({
            x: coordinate,
            y: coordinate,
            zoom: zoomValue,
          }),
        }),
        ({ point, viewport }) => {
          const screen = flowToScreenPosition(point, viewport);
          const flow = screenToFlowPosition(screen, viewport);

          expect(flow.x).toBeCloseTo(point.x, 8);
          expect(flow.y).toBeCloseTo(point.y, 8);
        },
      ),
      { numRuns: GPU_MATH_PROPERTY_RUNS },
    );
  });

  it("preserves the flow point under the cursor when zooming", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxZoomOffset: fc.double({
            max: 8,
            min: 0,
            noDefaultInfinity: true,
            noNaN: true,
          }),
          minZoom: zoomValue,
          point: fc.record({ x: coordinate, y: coordinate }),
          requestedZoom: zoomValue,
          viewport: fc.record({
            x: coordinate,
            y: coordinate,
            zoom: zoomValue,
          }),
        }),
        ({ maxZoomOffset, minZoom, point, requestedZoom, viewport }) => {
          const maxZoom = minZoom + maxZoomOffset;
          const before = screenToFlowPosition(point, viewport);
          const afterViewport = zoomGpuViewportAtScreenPoint({
            maxZoom,
            minZoom,
            point,
            viewport,
            zoom: requestedZoom,
          });
          const after = screenToFlowPosition(point, afterViewport);

          expect(afterViewport.zoom).toBeGreaterThanOrEqual(minZoom);
          expect(afterViewport.zoom).toBeLessThanOrEqual(maxZoom);
          expect(after.x).toBeCloseTo(before.x, 8);
          expect(after.y).toBeCloseTo(before.y, 8);
        },
      ),
      { numRuns: GPU_MATH_PROPERTY_RUNS },
    );
  });

  it("returns finite fit-view transforms within zoom bounds", () => {
    fc.assert(
      fc.property(
        fc.record({
          bounds: fc.record({
            height: nonNegativeDimension,
            width: nonNegativeDimension,
            x: coordinate,
            y: coordinate,
          }),
          canvasHeight: nonNegativeDimension,
          canvasWidth: nonNegativeDimension,
          maxZoomOffset: fc.double({
            max: 8,
            min: 0,
            noDefaultInfinity: true,
            noNaN: true,
          }),
          minZoom: zoomValue,
          overviewWidth: nonNegativeDimension,
          padding: fc.double({
            max: 2,
            min: 0,
            noDefaultInfinity: true,
            noNaN: true,
          }),
          viewportZoom: zoomValue,
        }),
        ({
          bounds,
          canvasHeight,
          canvasWidth,
          maxZoomOffset,
          minZoom,
          overviewWidth,
          padding,
          viewportZoom,
        }) => {
          const maxZoom = minZoom + maxZoomOffset;
          const viewport = getGpuViewportForBounds(bounds, {
            canvasHeight,
            canvasWidth,
            maxZoom,
            minZoom,
            overviewWidth,
            padding,
            viewport: [0, 0, viewportZoom],
          });

          expect(Number.isFinite(viewport.x)).toBe(true);
          expect(Number.isFinite(viewport.y)).toBe(true);
          expect(Number.isFinite(viewport.zoom)).toBe(true);
          expect(viewport.zoom).toBeGreaterThanOrEqual(minZoom);
          expect(viewport.zoom).toBeLessThanOrEqual(maxZoom);
        },
      ),
      { numRuns: GPU_MATH_PROPERTY_RUNS },
    );
  });
});
