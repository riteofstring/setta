import { adjustSizeToBeAtLeastMin } from "state/actions/sections/sectionSizes";
import { describe, expect, it } from "vitest";
import {
  clampChangedSize,
  getAutoClampSize,
  shouldEmitResizeEndEvent,
} from "./customResizableSizing";
import { SIZE_MODE } from "./utils";

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

describe("shouldEmitResizeEndEvent", () => {
  it("skips end when resize never started", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: false,
        resizeAttempted: false,
        isZeroDelta: true,
        isDoubleClick: false,
      }),
    ).toBe(false);
  });

  it("emits end when resize started", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: true,
        isZeroDelta: false,
        isDoubleClick: false,
      }),
    ).toBe(true);
  });
});

describe("getAutoClampSize", () => {
  it("returns null when the current size already satisfies the minimums", () => {
    expect(
      getAutoClampSize({
        size: { width: 200, height: 180 },
        minWidth: 150,
        minHeight: 120,
        aspectRatio: false,
        sizeMode: {
          width: SIZE_MODE.manual_only,
          height: SIZE_MODE.manual_only,
        },
      }),
    ).toBeNull();
  });

  it("adjusts both dimensions together when aspect ratio is locked", () => {
    const expected = adjustSizeToBeAtLeastMin(80, 140, 120, 150);

    expect(
      getAutoClampSize({
        size: { width: 140, height: 80 },
        minWidth: 150,
        minHeight: 120,
        aspectRatio: true,
        sizeMode: {
          width: SIZE_MODE.manual_only,
          height: SIZE_MODE.manual_only,
        },
      }),
    ).toEqual(expected);
  });
});
