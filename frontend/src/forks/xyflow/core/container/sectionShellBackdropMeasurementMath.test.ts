import { describe, expect, it } from "vitest";
import {
  measureSectionRelativeGraphSpaceRect,
  normalizeViewportScale,
  toGraphSpaceLength,
} from "./sectionShellBackdropMeasurementMath";

describe("sectionShellBackdropMeasurementMath", () => {
  it("keeps graph-space measurements stable across viewport zoom levels", () => {
    const graphSpaceRectAtOneX = measureSectionRelativeGraphSpaceRect({
      rect: {
        height: 24,
        left: 130,
        top: 260,
        width: 80,
      },
      sectionRect: {
        height: 400,
        left: 100,
        top: 200,
        width: 300,
      },
      viewportScale: 1,
    });

    const graphSpaceRectAtTwoX = measureSectionRelativeGraphSpaceRect({
      rect: {
        height: 48,
        left: 360,
        top: 620,
        width: 160,
      },
      sectionRect: {
        height: 800,
        left: 300,
        top: 500,
        width: 600,
      },
      viewportScale: 2,
    });

    expect(graphSpaceRectAtOneX).toEqual({
      height: 24,
      offsetX: 30,
      offsetY: 60,
      width: 80,
    });
    expect(graphSpaceRectAtTwoX).toEqual(graphSpaceRectAtOneX);
  });

  it("falls back to 1x graph-space math for invalid viewport scales", () => {
    expect(normalizeViewportScale(undefined)).toBe(1);
    expect(normalizeViewportScale(0)).toBe(1);
    expect(normalizeViewportScale(Number.NaN)).toBe(1);
    expect(toGraphSpaceLength(18, undefined)).toBe(18);
  });
});
