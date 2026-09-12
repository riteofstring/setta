import { describe, expect, it } from "vitest";

import {
  clampDrawingGridSpacing,
  DRAWING_GRID_DEFAULT_SPACING,
  DRAWING_GRID_MAXIMUM_SPACING,
  DRAWING_GRID_MINIMUM_SPACING,
  isDrawingGridSpacing,
  snapDrawingPointToGrid,
} from "./drawingGrid";

describe("drawing grid", () => {
  it("defines and validates the supported integer spacing range", () => {
    expect(DRAWING_GRID_DEFAULT_SPACING).toBe(16);
    expect(DRAWING_GRID_MINIMUM_SPACING).toBe(2);
    expect(DRAWING_GRID_MAXIMUM_SPACING).toBe(256);
    expect(isDrawingGridSpacing(DRAWING_GRID_MINIMUM_SPACING)).toBe(true);
    expect(isDrawingGridSpacing(DRAWING_GRID_DEFAULT_SPACING)).toBe(true);
    expect(isDrawingGridSpacing(DRAWING_GRID_MAXIMUM_SPACING)).toBe(true);
    expect(isDrawingGridSpacing(1)).toBe(false);
    expect(isDrawingGridSpacing(16.5)).toBe(false);
    expect(isDrawingGridSpacing(Number.NaN)).toBe(false);
    expect(isDrawingGridSpacing("16")).toBe(false);
  });

  it("rounds and clamps finite user spacing", () => {
    expect(clampDrawingGridSpacing(-100)).toBe(DRAWING_GRID_MINIMUM_SPACING);
    expect(clampDrawingGridSpacing(15.6)).toBe(16);
    expect(clampDrawingGridSpacing(1_000)).toBe(DRAWING_GRID_MAXIMUM_SPACING);
  });

  it("rejects non-finite user spacing", () => {
    expect(() => clampDrawingGridSpacing(Number.NaN)).toThrow(RangeError);
    expect(() => clampDrawingGridSpacing(Infinity)).toThrow(RangeError);
  });

  it("snaps a finite logical point to its nearest grid intersection", () => {
    expect(snapDrawingPointToGrid({ x: 3, y: 11 }, 8)).toEqual({
      x: 0,
      y: 8,
    });
    expect(snapDrawingPointToGrid({ x: 15, y: 17 })).toEqual({
      x: 16,
      y: 16,
    });
  });

  it("resolves midpoint ties symmetrically away from the origin", () => {
    expect(snapDrawingPointToGrid({ x: -8, y: 8 })).toEqual({
      x: -16,
      y: 16,
    });
  });

  it("uses clamped spacing while snapping", () => {
    expect(snapDrawingPointToGrid({ x: 200, y: -200 }, 1_000)).toEqual({
      x: 256,
      y: -256,
    });
  });

  it("preserves the exact point identity when no snapping is needed", () => {
    const point = Object.freeze({ x: 32, y: -48 });

    expect(snapDrawingPointToGrid(point)).toBe(point);
  });

  it("rejects non-finite logical points", () => {
    expect(() => snapDrawingPointToGrid({ x: Infinity, y: 0 })).toThrow(
      RangeError,
    );
    expect(() => snapDrawingPointToGrid({ x: 0, y: Number.NaN })).toThrow(
      RangeError,
    );
  });
});
