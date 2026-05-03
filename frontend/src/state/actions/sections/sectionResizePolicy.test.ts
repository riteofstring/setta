import { describe, expect, it } from "vitest";
import {
  clampChangedSize,
  getResizableEnable,
  getResizeAxisAvailability,
  resolveResizableGrid,
  shouldEmitResizeEndEvent,
  SIZE_MODE,
} from "./sectionResizePolicy";

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

describe("resize axis and handle availability", () => {
  it("uses min/max policy and auto-only mode to decide resizable axes", () => {
    expect(
      getResizeAxisAvailability({
        maxHeight: 300,
        maxWidth: 400,
        minHeight: 120,
        minWidth: 180,
        sizeMode: { height: SIZE_MODE.any, width: SIZE_MODE.any },
      }),
    ).toEqual({ heightResizable: true, widthResizable: true });

    expect(
      getResizeAxisAvailability({
        maxHeight: 300,
        maxWidth: 180,
        minHeight: 120,
        minWidth: 180,
        sizeMode: { height: SIZE_MODE.any, width: SIZE_MODE.any },
      }),
    ).toEqual({ heightResizable: true, widthResizable: false });

    expect(
      getResizeAxisAvailability({
        maxHeight: 120,
        maxWidth: 400,
        minHeight: 120,
        minWidth: 180,
        sizeMode: { height: SIZE_MODE.auto_only, width: SIZE_MODE.auto_only },
      }),
    ).toEqual({ heightResizable: false, widthResizable: false });
  });

  it("maps axis availability to only right, bottom, and bottom-right handles", () => {
    expect(
      getResizableEnable({
        disablePointerEvents: false,
        heightResizable: true,
        positionAndSizeLocked: false,
        widthResizable: true,
      }),
    ).toEqual({
      bottom: true,
      bottomLeft: false,
      bottomRight: true,
      left: false,
      right: true,
      top: false,
      topLeft: false,
      topRight: false,
    });

    expect(
      getResizableEnable({
        disablePointerEvents: false,
        heightResizable: true,
        positionAndSizeLocked: false,
        widthResizable: false,
      }),
    ).toEqual({
      bottom: true,
      bottomLeft: false,
      bottomRight: false,
      left: false,
      right: false,
      top: false,
      topLeft: false,
      topRight: false,
    });

    expect(
      getResizableEnable({
        disablePointerEvents: false,
        heightResizable: false,
        positionAndSizeLocked: false,
        widthResizable: true,
      }),
    ).toEqual({
      bottom: false,
      bottomLeft: false,
      bottomRight: false,
      left: false,
      right: true,
      top: false,
      topLeft: false,
      topRight: false,
    });
  });

  it("disables every handle when pointer ownership or layout locks block resize", () => {
    expect(
      getResizableEnable({
        disablePointerEvents: true,
        heightResizable: true,
        positionAndSizeLocked: false,
        widthResizable: true,
      }),
    ).toBe(false);

    expect(
      getResizableEnable({
        disablePointerEvents: false,
        heightResizable: true,
        positionAndSizeLocked: true,
        widthResizable: true,
      }),
    ).toBe(false);
  });
});

describe("resize snap grid handoff", () => {
  it("passes no grid when snap-to-grid is disabled", () => {
    expect(
      resolveResizableGrid({ snapGrid: [20, 30], snapToGrid: false }),
    ).toBeUndefined();
  });

  it("passes the configured snap grid when enabled", () => {
    const snapGrid = [20, 30] as const;

    expect(resolveResizableGrid({ snapGrid, snapToGrid: true })).toBe(snapGrid);
  });

  it("fails loudly when snap-to-grid is enabled with invalid grid values", () => {
    expect(() =>
      resolveResizableGrid({ snapGrid: [0, 30], snapToGrid: true }),
    ).toThrow("snap grid x must be a finite positive number");

    expect(() =>
      resolveResizableGrid({ snapGrid: [20, Number.NaN], snapToGrid: true }),
    ).toThrow("snap grid y must be a finite positive number");
  });
});
