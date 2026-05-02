/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { GpuNodeLayout } from "../GpuNodeLayer";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuNodeDragController,
  getGpuNodeDragAutoPanDelta,
  getGpuNodeDragItems,
  moveGpuNodeDragItems,
} from "./nodeDrag";

describe("GPU node drag controller", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("groups selected nodes only when the grabbed node is selected", () => {
    const nodes = [
      node("a", 10, 20, 30, 40),
      node("b", 50, 60, 70, 80),
      node("c", 90, 100, 110, 120),
    ];

    expect(
      getGpuNodeDragItems({
        nodeId: "a",
        nodes,
        pointerPosition: { x: 15, y: 25 },
        selectedNodeIds: ["a", "b"],
      }).map((item) => item.nodeId),
    ).toEqual(["a", "b"]);
    expect(
      getGpuNodeDragItems({
        nodeId: "c",
        nodes,
        pointerPosition: { x: 95, y: 105 },
        selectedNodeIds: ["a", "b"],
      }).map((item) => item.nodeId),
    ).toEqual(["c"]);
  });

  it("filters grouped drag items through per-node draggability", () => {
    const nodes = [
      node("a", 10, 20, 30, 40),
      node("b", 50, 60, 70, 80),
      node("c", 90, 100, 110, 120),
    ];

    expect(
      getGpuNodeDragItems({
        canDragNode: (nodeId) => nodeId !== "b",
        nodeId: "a",
        nodes,
        pointerPosition: { x: 15, y: 25 },
        selectedNodeIds: ["a", "b", "c"],
      }).map((item) => item.nodeId),
    ).toEqual(["a", "c"]);
  });

  it("moves drag items from flow-space pointer distance and snaps on request", () => {
    const items = getGpuNodeDragItems({
      nodeId: "a",
      nodes: [node("a", 10, 20, 30, 40)],
      pointerPosition: { x: 12, y: 23 },
    });

    expect(
      moveGpuNodeDragItems({
        items,
        pointerPosition: { x: 27, y: 38 },
      }),
    ).toMatchObject({
      changed: true,
      delta: { x: 15, y: 15 },
      items: [{ nodeId: "a", position: { x: 25, y: 35 } }],
    });
    const snappedItem = moveGpuNodeDragItems({
      items,
      pointerPosition: { x: 27, y: 38 },
      snapGrid: [10, 10],
      snapToGrid: true,
    }).items[0];
    expect(snappedItem?.position).toEqual({ x: 30, y: 40 });
  });

  it("emits flow-space positions while dragging and snaps on stop", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    element.append(nodeElement);
    const store = createGpuFlowViewportStore({
      transform: [10, 20, 2],
    });
    const onNodeDragStart = vi.fn();
    const onNodeDrag = vi.fn();
    const onNodeDragStop = vi.fn();
    const requestFrame = vi.fn();
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      element,
      getNodes: () => [node("a", 5, 10, 30, 40)],
      nodeDragThresholdPx: 1,
      onNodeDrag,
      onNodeDragStart,
      onNodeDragStop,
      requestFrame,
      snapGrid: [10, 10],
      snapToGrid: true,
      store,
    });

    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 30,
      clientY: 50,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 50,
      clientY: 74,
      pointerId: 1,
    });

    expect(store.getState().nodeDragging).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);
    expect(onNodeDragStart).toHaveBeenCalledWith({
      active: true,
      delta: { x: 0, y: 0 },
      items: [expect.objectContaining({ nodeId: "a" })],
      nodeId: "a",
      phase: "start",
    });
    expect(onNodeDrag).toHaveBeenLastCalledWith({
      active: true,
      delta: { x: 10, y: 12 },
      items: [
        expect.objectContaining({
          nodeId: "a",
          position: { x: 15, y: 22 },
        }),
      ],
      nodeId: "a",
      phase: "drag",
    });
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");

    dispatchPointer(document, "pointerup", {
      button: 0,
      clientX: 50,
      clientY: 74,
      pointerId: 1,
    });

    expect(onNodeDragStop).toHaveBeenLastCalledWith({
      active: false,
      delta: { x: 5, y: -2 },
      items: [
        expect.objectContaining({
          nodeId: "a",
          position: { x: 20, y: 20 },
        }),
      ],
      nodeId: "a",
      phase: "stop",
    });
    expect(store.getState().nodeDragging).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
    expect(requestFrame).toHaveBeenCalledWith("viewport");
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    detach();
  });

  it("requests a texture upload frame after an active drag is canceled", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    element.append(nodeElement);
    const store = createGpuFlowViewportStore();
    const onNodeDragCancel = vi.fn();
    const requestFrame = vi.fn();
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      element,
      getNodes: () => [node("a", 0, 0, 30, 40)],
      onNodeDragCancel,
      requestFrame,
      store,
    });

    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });

    expect(store.getState().nodeDragging).toBe(true);
    requestFrame.mockClear();

    dispatchPointer(document, "pointercancel", {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });

    expect(onNodeDragCancel).toHaveBeenCalledWith({
      active: false,
      delta: { x: 0, y: 0 },
      items: [expect.objectContaining({ nodeId: "a" })],
      nodeId: "a",
      phase: "cancel",
    });
    expect(store.getState().nodeDragging).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    detach();
  });

  it("ignores drag starts from nodrag descendants", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    const input = document.createElement("input");
    input.className = "nodrag";
    nodeElement.append(input);
    element.append(nodeElement);
    const onNodeDrag = vi.fn();
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      element,
      getNodes: () => [node("a", 0, 0, 30, 40)],
      onNodeDrag,
    });

    dispatchPointer(input, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });

    expect(onNodeDrag).not.toHaveBeenCalled();
    detach();
  });

  it("ignores drag starts when the node is not draggable", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    element.append(nodeElement);
    const onNodeDrag = vi.fn();
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      canDragNode: (nodeId) => nodeId !== "a",
      element,
      getNodes: () => [node("a", 0, 0, 30, 40)],
      onNodeDrag,
    });

    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });

    expect(onNodeDrag).not.toHaveBeenCalled();
    detach();
  });

  it("re-checks the disabled predicate before crossing the drag threshold", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    element.append(nodeElement);
    const onNodeDrag = vi.fn();
    let disabled = false;
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      disabled: () => disabled,
      element,
      getNodes: () => [node("a", 0, 0, 30, 40)],
      nodeDragThresholdPx: 10,
      onNodeDrag,
    });

    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    disabled = true;
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });

    expect(onNodeDrag).not.toHaveBeenCalled();

    disabled = false;
    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 2,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 2,
    });

    expect(onNodeDrag).toHaveBeenCalledWith({
      active: true,
      delta: { x: 30, y: 30 },
      items: [expect.objectContaining({ nodeId: "a" })],
      nodeId: "a",
      phase: "drag",
    });
    detach();
  });

  it("re-checks per-node draggability before crossing the drag threshold", () => {
    const element = createFlowElement();
    const nodeElement = createNodeElement("a");
    element.append(nodeElement);
    const onNodeDrag = vi.fn();
    let canDrag = true;
    const detach = attachGpuNodeDragController({
      autoPanOnNodeDrag: false,
      canDragNode: () => canDrag,
      element,
      getNodes: () => [node("a", 0, 0, 30, 40)],
      nodeDragThresholdPx: 10,
      onNodeDrag,
    });

    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    canDrag = false;
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });

    expect(onNodeDrag).not.toHaveBeenCalled();

    canDrag = true;
    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 2,
    });
    dispatchPointer(document, "pointermove", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 2,
    });

    expect(onNodeDrag).toHaveBeenCalledWith({
      active: true,
      delta: { x: 30, y: 30 },
      items: [expect.objectContaining({ nodeId: "a" })],
      nodeId: "a",
      phase: "drag",
    });
    detach();
  });

  it("computes auto-pan deltas from viewport edges and configured insets", () => {
    expect(
      getGpuNodeDragAutoPanDelta({
        point: { x: 0, y: 390 },
        viewportSize: { height: 400, width: 600 },
      }),
    ).toEqual({ x: 14, y: -10 });
    expect(
      getGpuNodeDragAutoPanDelta({
        insetsPx: { left: 100, right: 50 },
        maxSpeedPx: 10,
        point: { x: 120, y: 200 },
        viewportSize: { height: 400, width: 600 },
      }),
    ).toEqual({ x: 3, y: 0 });
    expect(
      getGpuNodeDragAutoPanDelta({
        point: { x: 1, y: 1 },
        viewportSize: { height: 0, width: 0 },
      }),
    ).toEqual({ x: 0, y: 0 });
  });
});

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
): GpuNodeLayout {
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
      left: 10,
      right: 610,
      top: 20,
      width: 600,
      x: 10,
      y: 20,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

function createNodeElement(nodeId: string): HTMLElement {
  const nodeElement = document.createElement("div");
  nodeElement.className = "setta-gpu-flow__node setta-gpu-flow__node";
  nodeElement.dataset.gpuFlowNode = "true";
  nodeElement.dataset.id = nodeId;
  return nodeElement;
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
