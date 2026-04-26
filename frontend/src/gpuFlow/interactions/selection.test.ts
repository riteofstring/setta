/* @vitest-environment jsdom */

import { SelectionModeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GpuNodeLayout } from "../GpuNodeLayer";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuSelectionController,
  getGpuNodeSelectionBounds,
  getGpuNodesInsideSelectionRect,
} from "./selection";

describe("GPU selection controller", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects nodes using full or partial flow-space overlap", () => {
    const nodes = [
      node("inside", 10, 10, 40, 40),
      node("partial", 80, 80, 40, 40),
      node("outside", 140, 140, 20, 20),
      node("unknown-size", 5, 5, null, 20),
    ];
    const rect = {
      height: 100,
      startX: 0,
      startY: 0,
      width: 100,
      x: 0,
      y: 0,
    };

    expect(
      getGpuNodesInsideSelectionRect({
        mode: SelectionModeEnum.full,
        nodes,
        rect,
        viewport: [0, 0, 1],
      }),
    ).toEqual(["inside"]);
    expect(
      getGpuNodesInsideSelectionRect({
        mode: SelectionModeEnum.partial,
        nodes,
        rect,
        viewport: [0, 0, 1],
      }),
    ).toEqual(["inside", "partial"]);
  });

  it("computes selected node bounds from measured GPU node layouts", () => {
    expect(
      getGpuNodeSelectionBounds(
        [
          node("a", 10, 20, 30, 40),
          node("b", 50, 5, 25, 10),
          node("unknown", 0, 0, null, 10),
        ],
        ["a", "b", "unknown"],
      ),
    ).toEqual({
      height: 55,
      width: 65,
      x: 10,
      y: 5,
    });
  });

  it("tracks pointer selection state on the GPU viewport store", () => {
    const element = createSurfaceElement();
    const surface = document.createElement("canvas");
    surface.dataset.gpuFlowSurface = "true";
    element.append(surface);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    store.getState().setSelectionKeyPressed(true);
    const onSelectionChange = vi.fn();
    const detach = attachGpuSelectionController({
      element,
      getNodes: () => [
        node("selected", 20, 20, 50, 50),
        node("too-wide", 120, 120, 50, 50),
      ],
      onSelectionChange,
      store,
    });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    expect(store.getState().userSelectionActive).toBe(false);
    expect(store.getState().userSelectionRect).toMatchObject({
      height: 0,
      startX: 10,
      startY: 10,
      width: 0,
      x: 10,
      y: 10,
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      active: false,
      phase: "start",
      rect: expect.objectContaining({ x: 10, y: 10 }),
      selectedNodeIds: [],
    });

    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 160,
      clientY: 160,
      pointerId: 1,
    });
    expect(store.getState().userSelectionActive).toBe(true);
    expect(store.getState().userSelectionRect).toMatchObject({
      height: 150,
      width: 150,
      x: 10,
      y: 10,
    });
    expect(store.getState().nodesSelectionBounds).toEqual({
      height: 50,
      width: 50,
      x: 20,
      y: 20,
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      active: true,
      phase: "change",
      rect: expect.objectContaining({ height: 150, width: 150, x: 10, y: 10 }),
      selectedNodeIds: ["selected"],
    });

    dispatchPointer(element, "pointerup", {
      button: 0,
      clientX: 160,
      clientY: 160,
      pointerId: 1,
    });
    expect(store.getState().userSelectionActive).toBe(false);
    expect(store.getState().userSelectionRect).toBeNull();
    expect(store.getState().nodesSelectionBounds).toEqual({
      height: 50,
      width: 50,
      x: 20,
      y: 20,
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      active: true,
      phase: "end",
      rect: expect.objectContaining({ height: 150, width: 150, x: 10, y: 10 }),
      selectedNodeIds: ["selected"],
    });
    detach();
  });

  it("starts only from the background while selection is enabled", () => {
    const element = createSurfaceElement();
    const surface = document.createElement("canvas");
    surface.dataset.gpuFlowSurface = "true";
    const nodeElement = document.createElement("div");
    nodeElement.className = "setta-gpu-flow__node";
    surface.append(nodeElement);
    element.append(surface);
    const store = createGpuFlowViewportStore();
    const detach = attachGpuSelectionController({
      element,
      getNodes: () => [node("a", 0, 0, 50, 50)],
      store,
    });

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 1,
      clientY: 1,
      pointerId: 1,
    });
    expect(store.getState().userSelectionRect).toBeNull();

    store.getState().setSelectionKeyPressed(true);
    dispatchPointer(nodeElement, "pointerdown", {
      button: 0,
      clientX: 1,
      clientY: 1,
      pointerId: 2,
    });
    expect(store.getState().userSelectionRect).toBeNull();

    dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 2,
      clientY: 3,
      pointerId: 3,
    });
    expect(store.getState().userSelectionRect).toMatchObject({
      startX: 2,
      startY: 3,
    });
    detach();
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

function createSurfaceElement(): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      bottom: 400,
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
