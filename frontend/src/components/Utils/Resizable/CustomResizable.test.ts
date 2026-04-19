import { describe, expect, it } from "vitest";
import {
  clampChangedSize,
  getResizableEnable,
  shouldEmitResizeEndEvent,
} from "./CustomResizable";

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

  it("preserves aspect ratio while enforcing both minimums", () => {
    const result = clampChangedSize({
      changedSize: { width: 50, height: 25 },
      minWidth: 100,
      minHeight: 60,
      aspectRatio: true,
    });
    expect(result).toEqual({ width: 120, height: 60 });
  });

  it("clamps only the provided numeric dimension", () => {
    const result = clampChangedSize({
      changedSize: { width: 80 },
      minWidth: 100,
      minHeight: 120,
      aspectRatio: false,
    });
    expect(result).toEqual({ width: 100 });
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

describe("getResizableEnable", () => {
  it("suppresses all section resize handles while the motion canvas shell is active", () => {
    expect(
      getResizableEnable({
        disablePointerEvents: false,
        suppressHandles: true,
        positionAndSizeLocked: false,
        heightResizable: true,
        widthResizable: true,
      }),
    ).toBe(false);
  });

  it("keeps the shared bottom/right handle set when motion suppression is off", () => {
    expect(
      getResizableEnable({
        disablePointerEvents: false,
        suppressHandles: false,
        positionAndSizeLocked: false,
        heightResizable: true,
        widthResizable: true,
      }),
    ).toEqual({
      top: false,
      left: false,
      bottom: true,
      right: true,
      topRight: false,
      bottomRight: true,
      topLeft: false,
      bottomLeft: false,
    });
  });
});
