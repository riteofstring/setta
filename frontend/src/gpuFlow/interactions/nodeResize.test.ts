/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import {
  GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE,
  getGpuNodeResizeCursor,
  resolveGpuNodeResizeDirection,
} from "../resizeHandles";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuNodeResizeController,
  resizeGpuNodeLayout,
} from "./nodeResize";

describe("GPU node resize handles", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves stable handle directions and cursors", () => {
    const handle = document.createElement("div");
    handle.setAttribute(GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE, "bottomRight");
    document.body.append(handle);

    expect(resolveGpuNodeResizeDirection(handle)).toBe("bottomRight");
    expect(getGpuNodeResizeCursor("right")).toBe("col-resize");
    expect(getGpuNodeResizeCursor("bottom")).toBe("row-resize");
    expect(getGpuNodeResizeCursor("bottomRight")).toBe("nwse-resize");
  });
});

describe("GPU node resize controller", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("coalesces pointer moves into one zoom-corrected resize frame", () => {
    const animationFrames = createAnimationFrameController();
    const element = createFlowElement();
    const { handle, pointerCapture } = createNodeResizeHandle("a", "bottomRight");
    element.append(handle.closest("[data-gpu-flow-node='true']") as Element);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 2],
    });
    const onNodeResizeStart = vi.fn();
    const onNodeResize = vi.fn();
    const requestFrame = vi.fn();
    const detach = attachGpuNodeResizeController({
      cancelAnimationFrame: animationFrames.cancelAnimationFrame,
      element,
      getNodes: () => [node("a", 0, 0, 100, 50)],
      onNodeResize,
      onNodeResizeStart,
      requestAnimationFrame: animationFrames.requestAnimationFrame,
      requestFrame,
      store,
    });

    dispatchPointer(handle, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 30,
      clientY: 20,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 50,
      clientY: 30,
      pointerId: 1,
    });

    expect(store.getState().nodeResizing).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);
    expect(pointerCapture.setPointerCapture).toHaveBeenCalledWith(1);
    expect(onNodeResizeStart).toHaveBeenCalledWith({
      active: true,
      direction: "bottomRight",
      layout: expect.objectContaining({ height: 50, width: 100 }),
      nodeId: "a",
      phase: "start",
      pointerDelta: { x: 0, y: 0 },
      sizeDelta: { height: 0, width: 0 },
      startLayout: expect.objectContaining({ height: 50, width: 100 }),
      totalSizeDelta: { height: 0, width: 0 },
    });
    expect(onNodeResize).not.toHaveBeenCalled();
    expect(animationFrames.requestAnimationFrame).toHaveBeenCalledOnce();

    animationFrames.flushNext();

    expect(onNodeResize).toHaveBeenCalledOnce();
    expect(onNodeResize).toHaveBeenLastCalledWith({
      active: true,
      direction: "bottomRight",
      layout: expect.objectContaining({ height: 60, width: 120 }),
      nodeId: "a",
      phase: "resize",
      pointerDelta: { x: 20, y: 10 },
      sizeDelta: { height: 10, width: 20 },
      startLayout: expect.objectContaining({ height: 50, width: 100 }),
      totalSizeDelta: { height: 10, width: 20 },
    });
    expect(requestFrame).toHaveBeenCalledWith("resize");
    detach();
  });

  it("flushes the pending resize frame before stop and releases capture", () => {
    const animationFrames = createAnimationFrameController();
    const element = createFlowElement();
    const { handle, pointerCapture } = createNodeResizeHandle("a", "right");
    element.append(handle.closest("[data-gpu-flow-node='true']") as Element);
    const store = createGpuFlowViewportStore();
    const onNodeResize = vi.fn();
    const onNodeResizeStop = vi.fn();
    const detach = attachGpuNodeResizeController({
      cancelAnimationFrame: animationFrames.cancelAnimationFrame,
      element,
      getNodes: () => [node("a", 0, 0, 100, 50)],
      onNodeResize,
      onNodeResizeStop,
      requestAnimationFrame: animationFrames.requestAnimationFrame,
      store,
    });

    dispatchPointer(handle, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 35,
      clientY: 30,
      pointerId: 1,
    });
    dispatchPointer(document, "pointerup", {
      button: 0,
      clientX: 35,
      clientY: 30,
      pointerId: 1,
    });

    expect(animationFrames.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(onNodeResize).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({ height: 50, width: 125 }),
        phase: "resize",
        pointerDelta: { x: 25, y: 20 },
      }),
    );
    expect(onNodeResizeStop).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        layout: expect.objectContaining({ height: 50, width: 125 }),
        phase: "stop",
        totalSizeDelta: { height: 0, width: 25 },
      }),
    );
    expect(pointerCapture.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(store.getState().nodeResizing).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
    detach();
  });

  it("cancels to the start layout on Escape", () => {
    const animationFrames = createAnimationFrameController();
    const element = createFlowElement();
    const { handle } = createNodeResizeHandle("a", "bottom");
    element.append(handle.closest("[data-gpu-flow-node='true']") as Element);
    const store = createGpuFlowViewportStore();
    const onNodeResizeCancel = vi.fn();
    const requestFrame = vi.fn();
    const detach = attachGpuNodeResizeController({
      cancelAnimationFrame: animationFrames.cancelAnimationFrame,
      element,
      getNodes: () => [node("a", 0, 0, 100, 50)],
      onNodeResizeCancel,
      requestAnimationFrame: animationFrames.requestAnimationFrame,
      requestFrame,
      store,
    });

    dispatchPointer(handle, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 10,
      clientY: 40,
      pointerId: 1,
    });
    dispatchKeyboard(document, "keydown", { key: "Escape" });

    expect(animationFrames.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(onNodeResizeCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        layout: expect.objectContaining({ height: 50, width: 100 }),
        phase: "cancel",
        pointerDelta: { x: 0, y: 0 },
        totalSizeDelta: { height: 0, width: 0 },
      }),
    );
    expect(store.getState().nodeResizing).toBe(false);
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    detach();
  });

  it("applies snap, min, max, and aspect ratio policy in flow space", () => {
    expect(
      resizeGpuNodeLayout({
        direction: "bottomRight",
        pointerDelta: { x: 26, y: 7 },
        policy: {
          maxHeight: 80,
          maxWidth: 130,
          minHeight: 40,
          minWidth: 90,
          snapGrid: [10, 10],
          snapToGrid: true,
        },
        startLayout: node("a", 0, 0, 100, 50),
      }),
    ).toMatchObject({ height: 60, width: 130 });

    expect(
      resizeGpuNodeLayout({
        direction: "right",
        pointerDelta: { x: 40, y: 0 },
        policy: {
          aspectRatio: true,
          maxHeight: 200,
          maxWidth: 200,
          minHeight: 40,
          minWidth: 40,
        },
        startLayout: node("a", 0, 0, 100, 50),
      }),
    ).toMatchObject({ height: 70, width: 140 });
  });
});

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): GpuNodeLayout & { readonly width: number; readonly height: number } {
  return {
    height,
    nodeId,
    width,
    x,
    y,
  };
}

function createFlowElement(): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      bottom: 420,
      height: 400,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
      x: 0,
      y: 0,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

function createNodeResizeHandle(
  nodeId: string,
  direction: "bottom" | "bottomRight" | "right",
): {
  readonly handle: HTMLElement;
  readonly pointerCapture: {
    readonly releasePointerCapture: ReturnType<typeof vi.fn>;
    readonly setPointerCapture: ReturnType<typeof vi.fn>;
  };
} {
  const nodeElement = document.createElement("div");
  nodeElement.className = "setta-gpu-flow__node";
  nodeElement.dataset.gpuFlowNode = "true";
  nodeElement.dataset.id = nodeId;
  const handle = document.createElement("div");
  handle.className = "section-resize-handle";
  handle.setAttribute(GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE, direction);
  const pointerCapture = {
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  };
  handle.releasePointerCapture = pointerCapture.releasePointerCapture;
  handle.setPointerCapture = pointerCapture.setPointerCapture;
  nodeElement.append(handle);
  return { handle, pointerCapture };
}

function createAnimationFrameController(): {
  readonly cancelAnimationFrame: ReturnType<typeof vi.fn>;
  readonly flushNext: () => void;
  readonly requestAnimationFrame: ReturnType<typeof vi.fn>;
} {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    frames.set(frameId, callback);
    return frameId;
  });
  const cancelAnimationFrame = vi.fn((frameId: number) => {
    frames.delete(frameId);
  });
  return {
    cancelAnimationFrame,
    flushNext: () => {
      const frame = frames.entries().next().value as
        | readonly [number, FrameRequestCallback]
        | undefined;
      if (!frame) {
        throw new Error("No animation frame is pending.");
      }
      const [frameId, callback] = frame;
      frames.delete(frameId);
      callback(0);
    },
    requestAnimationFrame,
  };
}

function dispatchPointer(
  element: Element | Document,
  type: string,
  options: {
    readonly button: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: options.button,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: options.pointerId });
  element.dispatchEvent(event);
}

function dispatchKeyboard(
  element: Element | Document,
  type: string,
  options: {
    readonly key: string;
  },
) {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key: options.key,
  });
  element.dispatchEvent(event);
}
