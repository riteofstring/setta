import { describe, expect, it } from "vitest";
import { getViewportInteractionActiveValue } from "./ZoomPane";

describe("getViewportInteractionActiveValue", () => {
  it("stays active while drag-pan is still running after pan-scroll settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("stays active while drag-pan is still running after a wheel-zoom burst settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("turns inactive only after every gesture source is idle", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: false,
      }),
    ).toBe(false);
  });
});
