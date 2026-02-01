import { describe, expect, it } from "vitest";
import {
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  SIZE_MODE,
} from "./utils";

describe("resize utils", () => {
  it("treats double-click overrides as auto even when event.detail is not 2", () => {
    const ref = { style: { width: "120px", height: "80px" } };
    const event = { detail: 1 };
    const result = getChangedSize({
      props: [event, "right", ref, { width: 0, height: 0 }],
      sizeMode: { width: SIZE_MODE.any, height: SIZE_MODE.any },
      aspectRatio: false,
      isDoubleClickOverride: true,
    });

    expect(result).toEqual({ width: "auto" });
  });

  it("detects double-clicks on the same resize handle direction", () => {
    const first = getResizeHandleClickState({
      state: { lastTimestampMs: null, lastDirection: null },
      direction: "right",
      timestampMs: 1000,
      thresholdMs: 300,
    });
    expect(first.isDoubleClick).toBe(false);

    const second = getResizeHandleClickState({
      state: first.nextState,
      direction: "right",
      timestampMs: 1200,
      thresholdMs: 300,
    });
    expect(second.isDoubleClick).toBe(true);
  });

  it("does not treat different directions as double-clicks", () => {
    const first = getResizeHandleClickState({
      state: { lastTimestampMs: null, lastDirection: null },
      direction: "right",
      timestampMs: 1000,
      thresholdMs: 300,
    });

    const second = getResizeHandleClickState({
      state: first.nextState,
      direction: "bottom",
      timestampMs: 1200,
      thresholdMs: 300,
    });

    expect(second.isDoubleClick).toBe(false);
  });

  it("only treats zero-delta clicks as double-clicks", () => {
    expect(
      isResizeDoubleClick({
        isPending: true,
        eventDetail: 2,
        isZeroDelta: false,
        resizeAttempted: true,
      }),
    ).toBe(false);

    expect(
      isResizeDoubleClick({
        isPending: true,
        eventDetail: 1,
        isZeroDelta: true,
        resizeAttempted: false,
      }),
    ).toBe(true);
  });
});
