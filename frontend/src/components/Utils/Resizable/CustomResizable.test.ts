import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { describe, expect, it } from "vitest";
import {
  getResizableHandleConfig,
  setGpuNodeResizeInteractionActive,
} from "./CustomResizable";

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
