import { describe, expect, it } from "vitest";
import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import {
  clampChangedSize,
  getResizableEnable,
  getResizeAxisAvailability,
  getResizableHandleConfig,
  setGpuNodeResizeInteractionActive,
  shouldEmitResizeEndEvent,
} from "./CustomResizable";
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
