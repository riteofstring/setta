import { describe, expect, it } from "vitest";
import { coerceClientRect, rectFromBoundingRect } from "./rect.js";

describe("rect adapter utilities", () => {
  it("converts dnd-kit bounding rectangles to client rects", () => {
    const result = rectFromBoundingRect({
      top: 10,
      left: 20,
      right: 70,
      bottom: 60,
      width: 50,
      height: 50,
    });

    expect(result).toEqual({
      top: 10,
      left: 20,
      right: 70,
      bottom: 60,
      width: 50,
      height: 50,
    });
  });

  it("coerces client rects from left/top based shapes", () => {
    const result = coerceClientRect({
      left: 4,
      top: 6,
      width: 10,
      height: 20,
    });

    expect(result).toEqual({
      left: 4,
      top: 6,
      right: 14,
      bottom: 26,
      width: 10,
      height: 20,
    });
  });

  it("coerces client rects from x/y based shapes", () => {
    const result = coerceClientRect({
      x: 8,
      y: 12,
      width: 40,
      height: 30,
    });

    expect(result).toEqual({
      left: 8,
      top: 12,
      right: 48,
      bottom: 42,
      width: 40,
      height: 30,
    });
  });

  it("returns null when value cannot be interpreted as a rect", () => {
    expect(coerceClientRect(null)).toBeNull();
    expect(coerceClientRect({})).toBeNull();
    expect(coerceClientRect({ left: 0, top: 0, width: 10 })).toBeNull();
    expect(coerceClientRect({ width: 10, height: 10 })).toBeNull();
  });
});
