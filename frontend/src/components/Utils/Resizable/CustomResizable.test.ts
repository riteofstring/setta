import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { describe, expect, it, vi } from "vitest";
import {
  clampChangedSize,
  getResizableEnable,
  getResizableHandleConfig,
  getResizeAxisAvailability,
  resolveResizableGrid,
  setGpuNodeResizeInteractionActive,
  shouldEmitResizeEndEvent,
} from "./CustomResizable";
import {
  cancelGpuNodeDimensionSync,
  flushGpuNodeDimensionSync,
  type GpuNodeDimensionSyncState,
  scheduleGpuNodeDimensionSync,
} from "./gpuNodeDimensionSync";
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

describe("resize GPU node dimension sync", () => {
  function createSyncState(): GpuNodeDimensionSyncState {
    return { element: null, frameId: null };
  }

  it("batches resize measurements onto one animation frame and keeps the latest element", () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const updateDimensions = vi.fn();
    const syncState = createSyncState();
    const firstElement = { marker: "first" } as unknown as HTMLElement;
    const secondElement = { marker: "second" } as unknown as HTMLElement;

    scheduleGpuNodeDimensionSync({
      element: firstElement,
      sectionId: "section-1",
      syncState,
      options: { requestFrame, updateDimensions },
    });
    scheduleGpuNodeDimensionSync({
      element: secondElement,
      sectionId: "section-1",
      syncState,
      options: { requestFrame, updateDimensions },
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(updateDimensions).not.toHaveBeenCalled();

    callbacks[0]?.(100);

    expect(updateDimensions).toHaveBeenCalledWith([
      {
        id: "section-1",
        nodeElement: secondElement,
        forceUpdate: true,
      },
    ]);
    expect(syncState).toEqual({ element: null, frameId: null });
  });

  it("flushes the final resize measurement synchronously and cancels pending work", () => {
    const requestFrame = vi.fn(() => 42);
    const cancelFrame = vi.fn();
    const updateDimensions = vi.fn();
    const syncState = createSyncState();
    const pendingElement = { marker: "pending" } as unknown as HTMLElement;
    const finalElement = { marker: "final" } as unknown as HTMLElement;

    scheduleGpuNodeDimensionSync({
      element: pendingElement,
      sectionId: "section-1",
      syncState,
      options: { requestFrame, updateDimensions },
    });
    flushGpuNodeDimensionSync({
      element: finalElement,
      sectionId: "section-1",
      syncState,
      options: { cancelFrame, updateDimensions },
    });

    expect(cancelFrame).toHaveBeenCalledWith(42);
    expect(updateDimensions).toHaveBeenCalledWith([
      {
        id: "section-1",
        nodeElement: finalElement,
        forceUpdate: true,
      },
    ]);
    expect(syncState).toEqual({ element: null, frameId: null });
  });

  it("cancels queued resize measurement work without publishing dimensions", () => {
    const requestFrame = vi.fn(() => 13);
    const cancelFrame = vi.fn();
    const updateDimensions = vi.fn();
    const syncState = createSyncState();

    scheduleGpuNodeDimensionSync({
      element: { marker: "pending" } as unknown as HTMLElement,
      sectionId: "section-1",
      syncState,
      options: { requestFrame, updateDimensions },
    });
    cancelGpuNodeDimensionSync({
      syncState,
      options: { cancelFrame },
    });

    expect(cancelFrame).toHaveBeenCalledWith(13);
    expect(updateDimensions).not.toHaveBeenCalled();
    expect(syncState).toEqual({ element: null, frameId: null });
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
  it("passes no grid to re-resizable when snap-to-grid is disabled", () => {
    expect(
      resolveResizableGrid({ snapGrid: [20, 30], snapToGrid: false }),
    ).toBeUndefined();
  });

  it("passes the configured snap grid to re-resizable when enabled", () => {
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
