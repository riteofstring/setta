import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { afterEach, describe, expect, it } from "vitest";
import { applyZoomToTransform, transformToString } from "./zoom";

describe("zoom adapter utilities", () => {
  afterEach(() => {
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
  });

  it("returns null and empty string for null transforms", () => {
    // Validates null-safe transform handling in drag style plumbing.
    expect(applyZoomToTransform(null)).toBeNull();
    expect(transformToString(null)).toBe("");
  });

  it("normalizes translation by current GPU viewport zoom", () => {
    // Validates drag translation stays in flow-space regardless of viewport zoom.
    gpuFlowViewportStore.getState().setTransform([0, 0, 2]);

    expect(
      applyZoomToTransform({ x: 20, y: 10, scaleX: 1, scaleY: 1 }),
    ).toEqual({
      x: 10,
      y: 5,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("renders transform strings with and without scale", () => {
    // Validates CSS transform serialization for sortable elements.
    expect(transformToString({ x: 4, y: 6, scaleX: 1, scaleY: 1 })).toBe(
      "translate3d(4px, 6px, 0)",
    );

    expect(transformToString({ x: 4, y: 6, scaleX: 1.2, scaleY: 0.8 })).toBe(
      "translate3d(4px, 6px, 0) scaleX(1.2) scaleY(0.8)",
    );
  });
});
