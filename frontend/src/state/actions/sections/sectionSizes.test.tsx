import { describe, expect, it } from "vitest";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
  getResizeStartAutoSizeUpdate,
} from "./sectionSizes";

describe("adjustSizeToBeAtLeastMin", () => {
  it("scales width when height is below min", () => {
    const result = adjustSizeToBeAtLeastMin(50, 200, 100, 120);
    expect(result).toEqual({ height: 100, width: 400 });
  });

  it("scales height when width is below min", () => {
    const result = adjustSizeToBeAtLeastMin(200, 50, 100, 120);
    expect(result).toEqual({ height: 480, width: 120 });
  });

  it("handles both dimensions below min", () => {
    const result = adjustSizeToBeAtLeastMin(50, 50, 100, 120);
    expect(result).toEqual({ height: 120, width: 120 });
  });

  it("returns original dimensions when within bounds", () => {
    const result = adjustSizeToBeAtLeastMin(150, 200, 100, 120);
    expect(result).toEqual({ height: 150, width: 200 });
  });
});

describe("adjustAspectRatio", () => {
  it("returns image size when both dimensions are auto", () => {
    const result = adjustAspectRatio("auto", "auto", 100, 200);
    expect(result).toEqual({ height: 100, width: 200 });
  });

  it("adjusts height when height is auto", () => {
    const result = adjustAspectRatio("auto", 300, 100, 200);
    expect(result).toEqual({ height: 150, width: 300 });
  });

  it("adjusts width when width is auto", () => {
    const result = adjustAspectRatio(100, "auto", 100, 200);
    expect(result).toEqual({ height: 100, width: 200 });
  });

  it("adjusts width when current ratio is wider than image", () => {
    const result = adjustAspectRatio(100, 400, 100, 200);
    expect(result).toEqual({ height: 100, width: 200 });
  });

  it("adjusts height when current ratio is taller than image", () => {
    const result = adjustAspectRatio(100, 100, 100, 200);
    expect(result).toEqual({ height: 50, width: 100 });
  });
});

describe("getResizeStartAutoSizeUpdate", () => {
  it("returns numeric height when dragging from auto height", () => {
    const result = getResizeStartAutoSizeUpdate({
      size: { width: 200, height: "auto" },
      direction: "bottom",
      rect: { width: 200, height: 420.6 },
    });
    expect(result).toEqual({ height: 421 });
  });

  it("returns numeric width when dragging from auto width", () => {
    const result = getResizeStartAutoSizeUpdate({
      size: { width: "auto", height: 150 },
      direction: "right",
      rect: { width: 318.2, height: 150 },
    });
    expect(result).toEqual({ width: 318 });
  });

  it("returns both dimensions when dragging from auto size", () => {
    const result = getResizeStartAutoSizeUpdate({
      size: { width: "auto", height: "auto" },
      direction: "bottomRight",
      rect: { width: 512.4, height: 288.9 },
    });
    expect(result).toEqual({ width: 512, height: 289 });
  });

  it("returns null when size is already explicit", () => {
    const result = getResizeStartAutoSizeUpdate({
      size: { width: 240, height: 160 },
      direction: "bottom",
      rect: { width: 240, height: 200 },
    });
    expect(result).toBeNull();
  });
});
