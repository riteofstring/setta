/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGpuFlowLayoutStore } from "../layoutStore";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuSelectionDragController,
  buildGpuSelectionKeyboardNudgePlan,
  getGpuSelectionDragItems,
  hitTestGpuSelectionBounds,
  moveGpuSelectionDragItems,
  snapGpuSelectionDragItems,
  syncGpuSelectionBoundsFromLayoutStore,
  type GpuSelectionDragItem,
} from "./selectionDrag";

describe("GPU selection drag controller", () => {
  beforeEach(() => {
    resetQueuedAnimationFrames();
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (callback) => {
        const id = nextAnimationFrameId++;
        queuedAnimationFrames.push({ callback, canceled: false, id });
        return id;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
      const frame = queuedAnimationFrames.find((item) => item.id === id);
      if (frame) {
        frame.canceled = true;
      }
    });
  });

  afterEach(() => {
    flushQueuedAnimationFrames();
    vi.restoreAllMocks();
    resetQueuedAnimationFrames();
    document.body.innerHTML = "";
  });

  it("filters selected drag items through renderer layout order and draggability", () => {
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        node("a", 10, 20, 80, 40),
        node("b", 100, 120, 60, 30),
        node("c", 300, 320, 90, 70),
      ],
    });

    expect(
      getGpuSelectionDragItems({
        canDragNode: (nodeId) => nodeId !== "b",
        layoutStore,
        selectedNodeIds: ["b", "a", "c"],
      }),
    ).toEqual([
      {
        height: 40,
        nodeId: "a",
        position: { x: 10, y: 20 },
        width: 80,
      },
      {
        height: 70,
        nodeId: "c",
        position: { x: 300, y: 320 },
        width: 90,
      },
    ]);
  });

  it("moves, nudges, and snaps selected nodes in generic flow-space helpers", () => {
    const items: GpuSelectionDragItem[] = [
      {
        height: 40,
        nodeId: "a",
        position: { x: 10, y: 20 },
        width: 80,
      },
      {
        height: null,
        nodeId: "b",
        position: { x: -5, y: 30 },
        width: null,
      },
    ];

    expect(
      moveGpuSelectionDragItems({
        items,
        lastFlowPoint: { x: 100, y: 200 },
        nextFlowPoint: { x: 112, y: 194 },
      }),
    ).toEqual({
      changed: true,
      delta: { x: 12, y: -6 },
      items: [
        {
          height: 40,
          nodeId: "a",
          position: { x: 22, y: 14 },
          width: 80,
        },
        {
          height: null,
          nodeId: "b",
          position: { x: 7, y: 24 },
          width: null,
        },
      ],
    });

    const firstItem = items[0];
    if (!firstItem) {
      throw new Error("Expected a selection drag item.");
    }

    expect(
      buildGpuSelectionKeyboardNudgePlan({
        direction: { x: 0, y: -1 },
        isShiftPressed: true,
        items: [firstItem],
        snapGrid: [16, 12],
        snapToGrid: true,
      }),
    ).toEqual({
      delta: { x: 0, y: -48 },
      items: [
        {
          height: 40,
          nodeId: "a",
          position: { x: 16, y: -24 },
          width: 80,
        },
      ],
    });

    expect(
      snapGpuSelectionDragItems({
        items: [
          {
            height: 40,
            nodeId: "a",
            position: { x: 23, y: 58 },
            width: 80,
          },
        ],
        snapGrid: [16, 12],
      }),
    ).toEqual({
      changed: true,
      delta: { x: -7, y: 2 },
      items: [
        {
          height: 40,
          nodeId: "a",
          position: { x: 16, y: 60 },
          width: 80,
        },
      ],
    });
  });

  it("moves selected nodes through the selection bounds hit target and owns live layout state", () => {
    const { element, surface } = createSelectionDragElements();
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        node("a", 10, 20, 80, 40, 0),
        node("b", 100, 120, 60, 30, 1),
        node("c", 300, 320, 90, 70, 2),
      ],
    });
    const viewportStore = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    viewportStore.getState().setNodesSelectionBounds({
      height: 130,
      width: 150,
      x: 10,
      y: 20,
    });
    const onSelectionDragStart = vi.fn();
    const onSelectionDrag = vi.fn();
    const onSelectionDragStop = vi.fn();
    const requestFrame = vi.fn();
    const detach = attachGpuSelectionDragController({
      autoPanOnSelectionDrag: false,
      element,
      layoutStore,
      onSelectionDrag,
      onSelectionDragStart,
      onSelectionDragStop,
      requestFrame,
      selectedNodeIds: ["a", "b"],
      store: viewportStore,
    });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 25,
      clientY: 45,
      pointerId: 7,
    });

    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    expect(viewportStore.getState().nodeDragging).toBe(true);
    expect(layoutStore.getState().getNode("a")).toMatchObject({
      interactionFlags: { dragging: true },
      tempZIndex: 1000,
      zIndex: 0,
    });
    expect(layoutStore.getState().getNode("b")).toMatchObject({
      interactionFlags: { dragging: true },
      tempZIndex: 1001,
      zIndex: 1,
    });
    expect(onSelectionDragStart).toHaveBeenCalledWith({
      active: true,
      delta: { x: 0, y: 0 },
      items: [
        expect.objectContaining({ nodeId: "a" }),
        expect.objectContaining({ nodeId: "b" }),
      ],
      phase: "start",
      selectedNodeIds: ["a", "b"],
    });

    dispatchPointer(surface, "pointermove", {
      button: 0,
      clientX: 45,
      clientY: 65,
      pointerId: 7,
    });

    expect(layoutStore.getState().getNode("a")).toMatchObject({
      x: 30,
      y: 40,
    });
    expect(layoutStore.getState().getNode("b")).toMatchObject({
      x: 120,
      y: 140,
    });
    expect(onSelectionDrag).toHaveBeenLastCalledWith({
      active: true,
      delta: { x: 20, y: 20 },
      items: [
        expect.objectContaining({
          nodeId: "a",
          position: { x: 30, y: 40 },
        }),
        expect.objectContaining({
          nodeId: "b",
          position: { x: 120, y: 140 },
        }),
      ],
      phase: "drag",
      selectedNodeIds: ["a", "b"],
    });

    dispatchPointer(surface, "pointerup", {
      button: 0,
      clientX: 45,
      clientY: 65,
      pointerId: 7,
    });

    expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(viewportStore.getState().nodeDragging).toBe(false);
    expect(layoutStore.getState().getNode("a")).toMatchObject({
      tempZIndex: 0,
      x: 30,
      y: 40,
      zIndex: 0,
    });
    expect(
      layoutStore.getState().getNode("a")?.interactionFlags,
    ).toBeUndefined();
    expect(onSelectionDragStop).toHaveBeenLastCalledWith({
      active: false,
      delta: { x: 0, y: 0 },
      items: [
        expect.objectContaining({
          nodeId: "a",
          position: { x: 30, y: 40 },
        }),
        expect.objectContaining({
          nodeId: "b",
          position: { x: 120, y: 140 },
        }),
      ],
      phase: "stop",
      selectedNodeIds: ["a", "b"],
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    detach();
  });

  it("uses selection drag auto-pan frames to pan the viewport and keep selected nodes under the pointer", () => {
    const { element, surface } = createSelectionDragElements();
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [node("a", 10, 20, 80, 40), node("b", 100, 120, 60, 30)],
    });
    const viewportStore = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    viewportStore.getState().setNodesSelectionBounds({
      height: 400,
      width: 600,
      x: 0,
      y: 0,
    });
    const detach = attachGpuSelectionDragController({
      element,
      layoutStore,
      selectedNodeIds: ["a", "b"],
      store: viewportStore,
    });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 600,
      clientY: 410,
      pointerId: 11,
    });

    expect(viewportStore.getState().transform).toEqual([0, 0, 1]);

    runNextAnimationFrame();

    expect(viewportStore.getState().transform).toEqual([-10, -10, 1]);
    expect(layoutStore.getState().getNode("a")).toMatchObject({
      x: 20,
      y: 30,
    });
    expect(layoutStore.getState().getNode("b")).toMatchObject({
      x: 110,
      y: 130,
    });
    detach();
  });

  it("commits keyboard nudge through the layout store and recomputes selected bounds from layout", () => {
    const { element } = createSelectionDragElements();
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [node("a", 10, 20, 80, 40), node("b", 100, 120, 60, 30)],
    });
    const viewportStore = createGpuFlowViewportStore();
    viewportStore.getState().setNodesSelectionBounds({
      height: 130,
      width: 150,
      x: 10,
      y: 20,
    });
    const onSelectionKeyboardNudge = vi.fn();
    const detach = attachGpuSelectionDragController({
      canDragNode: (nodeId) => nodeId !== "b",
      element,
      layoutStore,
      onSelectionKeyboardNudge,
      selectedNodeIds: ["a", "b"],
      store: viewportStore,
    });

    dispatchKeyboard(element, "keydown", {
      key: "ArrowRight",
      shiftKey: false,
    });
    syncGpuSelectionBoundsFromLayoutStore({
      layoutStore,
      selectedNodeIds: ["a", "b"],
      store: viewportStore,
    });

    expect(layoutStore.getState().getNode("a")).toMatchObject({
      x: 15,
      y: 20,
    });
    expect(layoutStore.getState().getNode("b")).toMatchObject({
      x: 100,
      y: 120,
    });
    expect(viewportStore.getState().nodesSelectionBounds).toEqual({
      height: 130,
      width: 145,
      x: 15,
      y: 20,
    });
    expect(onSelectionKeyboardNudge).toHaveBeenCalledWith({
      delta: { x: 5, y: 0 },
      items: [
        {
          height: 40,
          nodeId: "a",
          position: { x: 15, y: 20 },
          width: 80,
        },
      ],
      selectedNodeIds: ["a"],
    });
    detach();
  });

  it("hit-tests selection bounds from renderer-owned flow geometry", () => {
    expect(
      hitTestGpuSelectionBounds({
        bounds: { height: 60, width: 80, x: 10, y: 20 },
        screenPoint: { x: 45, y: 55 },
        viewport: [5, 10, 2],
      }),
    ).toBe(true);
    expect(
      hitTestGpuSelectionBounds({
        bounds: { height: 60, width: 80, x: 10, y: 20 },
        screenPoint: { x: 210, y: 55 },
        viewport: [5, 10, 2],
      }),
    ).toBe(false);
  });

  it("ignores pointer starts outside the renderer-owned selection bounds", () => {
    const { element, surface } = createSelectionDragElements();
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [node("a", 10, 20, 80, 40)],
    });
    const viewportStore = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    viewportStore.getState().setNodesSelectionBounds({
      height: 40,
      width: 80,
      x: 10,
      y: 20,
    });
    const onSelectionDragStart = vi.fn();
    const detach = attachGpuSelectionDragController({
      element,
      layoutStore,
      onSelectionDragStart,
      selectedNodeIds: ["a"],
      store: viewportStore,
    });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 240,
      clientY: 220,
      pointerId: 17,
    });

    expect(onSelectionDragStart).not.toHaveBeenCalled();
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    expect(viewportStore.getState().nodeDragging).toBe(false);
    detach();
  });
});

type QueuedAnimationFrame = {
  readonly callback: FrameRequestCallback;
  canceled: boolean;
  readonly id: number;
};

let nextAnimationFrameId = 1;
let queuedAnimationFrames: QueuedAnimationFrame[] = [];

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
  zIndex = 0,
) {
  return {
    height,
    nodeId,
    tempZIndex: zIndex,
    width,
    x,
    y,
    zIndex,
  };
}

function createSelectionDragElements() {
  const element = document.createElement("div");
  element.tabIndex = -1;
  element.getBoundingClientRect = () =>
    ({
      bottom: 420,
      height: 400,
      left: 10,
      right: 610,
      top: 20,
      width: 600,
      x: 10,
      y: 20,
    }) as DOMRect;
  element.focus = vi.fn();
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  const surface = document.createElement("canvas");
  surface.dataset.gpuFlowSurface = "true";
  element.append(surface);
  document.body.append(element);
  return { element, surface };
}

function dispatchPointer(
  element: Element,
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
  element: Element,
  type: string,
  options: {
    readonly key: string;
    readonly shiftKey: boolean;
  },
) {
  element.dispatchEvent(
    new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: options.key,
      shiftKey: options.shiftKey,
    }),
  );
}

function runNextAnimationFrame(): boolean {
  while (queuedAnimationFrames.length > 0) {
    const frame = queuedAnimationFrames.shift();
    if (!frame || frame.canceled) {
      continue;
    }
    frame.callback(0);
    return true;
  }
  return false;
}

function flushQueuedAnimationFrames() {
  for (let index = 0; index < 50 && runNextAnimationFrame(); index += 1) {
    // Exhaust queued auto-pan callbacks.
  }
}

function resetQueuedAnimationFrames() {
  nextAnimationFrameId = 1;
  queuedAnimationFrames = [];
}
