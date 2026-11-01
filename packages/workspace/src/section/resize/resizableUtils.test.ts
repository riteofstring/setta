import { describe, expect, it } from "vitest";
import {
  clampChangedSize,
  getAutoClampSize,
  getChangedSize,
  getResizableEnable,
  getResizeHandleClickState,
  isResizeDoubleClick,
  shouldEmitResizeEndEvent,
} from "./resizableUtils.js";

describe("getResizeHandleClickState", () => {
  it("detects a second press on the same handle inside the threshold", () => {
    const first = getResizeHandleClickState({
      state: { lastTimestampMs: null, lastDirection: null },
      direction: "right",
      timestampMs: 1000,
    });
    expect(first.isDoubleClick).toBe(false);

    const second = getResizeHandleClickState({
      state: first.nextState,
      direction: "right",
      timestampMs: 1250,
    });
    expect(second.isDoubleClick).toBe(true);
  });

  it("rejects a press on a different handle or outside the threshold", () => {
    const first = getResizeHandleClickState({
      state: { lastTimestampMs: null, lastDirection: null },
      direction: "right",
      timestampMs: 1000,
    });

    expect(
      getResizeHandleClickState({
        state: first.nextState,
        direction: "bottom",
        timestampMs: 1100,
      }).isDoubleClick,
    ).toBe(false);
    expect(
      getResizeHandleClickState({
        state: first.nextState,
        direction: "right",
        timestampMs: 1500,
      }).isDoubleClick,
    ).toBe(false);
  });
});

describe("isResizeDoubleClick", () => {
  it("requires a zero delta with no attempted resize", () => {
    expect(
      isResizeDoubleClick({
        isPending: true,
        isZeroDelta: true,
        resizeAttempted: false,
      }),
    ).toBe(true);
    expect(
      isResizeDoubleClick({
        isPending: false,
        eventDetail: 2,
        isZeroDelta: true,
        resizeAttempted: false,
      }),
    ).toBe(true);
    expect(
      isResizeDoubleClick({
        isPending: true,
        isZeroDelta: false,
        resizeAttempted: false,
      }),
    ).toBe(false);
    expect(
      isResizeDoubleClick({
        isPending: true,
        isZeroDelta: true,
        resizeAttempted: true,
      }),
    ).toBe(false);
  });
});

describe("getChangedSize", () => {
  const ref = { style: { width: "224px", height: "96px" } };

  it("commits the pixel size re-resizable wrote for a plain resize", () => {
    expect(
      getChangedSize({
        props: [{}, "bottomRight", ref, { width: 10, height: 5 }],
      }),
    ).toEqual({
      width: 224,
      height: 96,
    });
    expect(
      getChangedSize({ props: [{}, "right", ref, { width: 10, height: 0 }] }),
    ).toEqual({
      width: 224,
    });
    expect(
      getChangedSize({ props: [{}, "bottom", ref, { width: 0, height: 5 }] }),
    ).toEqual({
      height: 96,
    });
  });

  it("returns the affected dimensions to auto on a handle double-click", () => {
    expect(
      getChangedSize({
        props: [{}, "bottomRight", ref, { width: 0, height: 0 }],
        isDoubleClickOverride: true,
      }),
    ).toEqual({ width: "auto", height: "auto" });
    expect(
      getChangedSize({
        props: [{ detail: 2 }, "right", ref, { width: 0, height: 0 }],
      }),
    ).toEqual({ width: "auto" });
  });
});

describe("shouldEmitResizeEndEvent", () => {
  it("emits only after a started resize that did something", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: false,
        resizeAttempted: true,
        isZeroDelta: false,
        isDoubleClick: false,
      }),
    ).toBe(false);
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: false,
        isZeroDelta: true,
        isDoubleClick: false,
      }),
    ).toBe(false);
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: true,
        isZeroDelta: false,
        isDoubleClick: false,
      }),
    ).toBe(true);
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: false,
        isZeroDelta: true,
        isDoubleClick: true,
      }),
    ).toBe(true);
  });
});

describe("clampChangedSize", () => {
  it("clamps numeric dimensions to the registered bounds and leaves auto untouched", () => {
    expect(
      clampChangedSize({
        changedSize: { width: 50, height: 200 },
        minHeight: 32,
        maxHeight: 50,
        minWidth: 200,
        maxWidth: 240,
      }),
    ).toEqual({ width: 200, height: 50 });
    expect(
      clampChangedSize({
        changedSize: { width: "auto", height: 400 },
        minHeight: 32,
        maxHeight: 500,
        minWidth: 200,
        maxWidth: 300,
      }),
    ).toEqual({ width: "auto", height: 400 });
    expect(
      clampChangedSize({
        changedSize: { width: 250 },
        minHeight: 32,
        maxHeight: 500,
        minWidth: 200,
        maxWidth: 300,
      }),
    ).toEqual({ width: 250 });
  });
});

describe("getAutoClampSize", () => {
  it("clamps stored sizes more than the tolerance below the minimums", () => {
    expect(
      getAutoClampSize({
        size: { width: 100, height: 20 },
        minHeight: 32,
        maxHeight: 100_000,
        minWidth: 200,
        maxWidth: 100_000,
      }),
    ).toEqual({ width: 200, height: 32 });

    expect(
      getAutoClampSize({
        size: { width: 199, height: 31 },
        minHeight: 32,
        maxHeight: 100_000,
        minWidth: 200,
        maxWidth: 100_000,
      }),
    ).toBeNull();
    expect(
      getAutoClampSize({
        size: { width: "auto", height: "auto" },
        minHeight: 32,
        maxHeight: 100_000,
        minWidth: 200,
        maxWidth: 100_000,
      }),
    ).toBeNull();
    expect(
      getAutoClampSize({
        size: { width: 250, height: 150 },
        minHeight: 50,
        maxHeight: 50,
        minWidth: 200,
        maxWidth: 100_000,
      }),
    ).toEqual({ height: 50 });
  });
});

describe("getResizableEnable", () => {
  it("keeps horizontal resizing while removing fixed-height handles", () => {
    expect(
      getResizableEnable({
        canEditLayout: true,
        disablePointerEvents: false,
        positionAndSizeLocked: false,
        heightResizable: false,
      }),
    ).toEqual({
      top: false,
      left: false,
      bottom: false,
      right: true,
      topRight: false,
      bottomRight: false,
      topLeft: false,
      bottomLeft: false,
    });
  });
});
