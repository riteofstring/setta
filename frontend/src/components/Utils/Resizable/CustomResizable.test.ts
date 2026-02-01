import { adjustSizeToBeAtLeastMin } from "state/actions/sections/sectionSizes";
import { describe, expect, it } from "vitest";
import { clampChangedSize } from "./CustomResizable";

describe("clampChangedSize", () => {
  it("clamps width and height independently when aspect ratio is off", () => {
    const result = clampChangedSize({
      changedSize: { width: 80, height: 90 },
      minWidth: 100,
      minHeight: 120,
      aspectRatio: false,
    });
    expect(result).toEqual({ width: 100, height: 120 });
  });

  it("does not adjust the other dimension when aspect ratio is off", () => {
    const result = clampChangedSize({
      changedSize: { width: 80, height: 200 },
      minWidth: 100,
      minHeight: 120,
      aspectRatio: false,
    });
    expect(result).toEqual({ width: 100, height: 200 });
  });

  it("preserves ratio when aspect ratio is on", () => {
    const expected = adjustSizeToBeAtLeastMin(80, 200, 120, 150);
    const result = clampChangedSize({
      changedSize: { width: 200, height: 80 },
      minWidth: 150,
      minHeight: 120,
      aspectRatio: true,
    });
    expect(result).toEqual(expected);
  });
});
