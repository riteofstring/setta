import { describe, expect, it } from "vitest";
import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import {
  clampChangedSize,
  getResizableHandleConfig,
  setGpuNodeResizeInteractionActive,
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

describe("resize GPU interaction ownership", () => {
  it("marks node resizing as an active GPU viewport interaction", () => {
    const store = createGpuFlowViewportStore();
    const activeRef = { current: false };

    setGpuNodeResizeInteractionActive(true, activeRef, { store });

    expect(activeRef.current).toBe(true);
    expect(store.getState().nodeResizing).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);

    setGpuNodeResizeInteractionActive(false, activeRef, { store });

    expect(activeRef.current).toBe(false);
    expect(store.getState().nodeResizing).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
  });

  it("keeps resize handles covered by nodrag and nopan classes", () => {
    const configs = [
      getResizableHandleConfig({
        activeResizeHandle: null,
        isAttachedTerminalChild: false,
        isMetaControl: false,
      }),
      getResizableHandleConfig({
        activeResizeHandle: "bottomRight",
        isAttachedTerminalChild: false,
        isMetaControl: true,
      }),
      getResizableHandleConfig({
        activeResizeHandle: null,
        isAttachedTerminalChild: true,
        isMetaControl: false,
      }),
    ];

    for (const config of configs) {
      expect(config.handleWrapperClassName).toContain(NO_DRAG_CLASS_NAME);
      expect(config.handleWrapperClassName).toContain(NO_PAN_CLASS_NAME);
      for (const className of Object.values(config.handleClasses)) {
        expect(className).toContain(NO_DRAG_CLASS_NAME);
        expect(className).toContain(NO_PAN_CLASS_NAME);
      }
    }
  });
});
