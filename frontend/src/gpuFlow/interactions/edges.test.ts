/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "../edges/edgeGeometry";
import type { GpuEdgeScene, GpuEdgeSceneEntry } from "../edges/edgeSources";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuEdgeInteractionController,
  hitTestGpuEdgeInteraction,
} from "./edges";

describe("GPU edge interaction controller", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hit-tests scene edges in flow space with screen-pixel tolerance", () => {
    const { element } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, 5, 2],
    });
    store.getState().setDomNode(element);
    const scene = createEdgeScene();

    const hit = hitTestGpuEdgeInteraction({
      event: { clientX: 210, clientY: 95 },
      getScene: () => scene,
      screenTolerancePx: 8,
      store,
    });

    expect(hit).toMatchObject({
      edgeId: "edge-a",
      family: "data",
      flowPoint: { x: 50, y: 20 },
      sceneEdgeId: "data:edge-a",
      screenPoint: { x: 110, y: 45 },
      sourceEdgeId: "edge-a",
    });
  });

  it("captures pointer clicks over GPU edges before background handlers", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    store.getState().setDomNode(element);
    const onBackgroundPointerDown = vi.fn();
    const onEdgePointerDown = vi.fn();
    const onEdgeClick = vi.fn();
    element.addEventListener("pointerdown", onBackgroundPointerDown);
    const detach = attachGpuEdgeInteractionController({
      element,
      getScene: () => createEdgeScene(),
      onEdgeClick,
      onEdgePointerDown,
      store,
    });

    const downPrevented = !dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });
    const upPrevented = !dispatchPointer(surface, "pointerup", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });

    expect(downPrevented).toBe(true);
    expect(upPrevented).toBe(true);
    expect(onBackgroundPointerDown).not.toHaveBeenCalled();
    expect(onEdgePointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        edgeId: "edge-a",
        nativeEvent: expect.any(MouseEvent),
        sceneEdgeId: "data:edge-a",
      }),
    );
    expect(onEdgeClick).toHaveBeenCalledWith(
      expect.objectContaining({
        edgeId: "edge-a",
        nativeEvent: expect.any(MouseEvent),
        sceneEdgeId: "data:edge-a",
      }),
    );
    detach();
  });

  it("ignores native node targets even when the pointer is over edge geometry", () => {
    const { element, surface } = createGpuFlowSurface();
    const node = document.createElement("div");
    node.className = "setta-gpu-flow__node";
    surface.append(node);
    const store = createGpuFlowViewportStore();
    store.getState().setDomNode(element);
    const onEdgePointerDown = vi.fn();
    const detach = attachGpuEdgeInteractionController({
      element,
      getScene: () => createEdgeScene(),
      onEdgePointerDown,
      store,
    });

    dispatchPointer(node, "pointerdown", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });

    expect(onEdgePointerDown).not.toHaveBeenCalled();
    detach();
  });

  it("routes context menus through edge hit-test metadata", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore();
    store.getState().setDomNode(element);
    const onEdgeContextMenu = vi.fn();
    const detach = attachGpuEdgeInteractionController({
      element,
      getScene: () => createEdgeScene(),
      onEdgeContextMenu,
      store,
    });

    const prevented = !dispatchMouse(surface, "contextmenu", {
      button: 2,
      clientX: 150,
      clientY: 70,
    });

    expect(prevented).toBe(true);
    expect(onEdgeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        edgeId: "edge-a",
        family: "data",
        nativeEvent: expect.any(MouseEvent),
      }),
    );
    detach();
  });

  it("emits hover changes and clears hover on pointer leave", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore();
    store.getState().setDomNode(element);
    const onEdgePointerMove = vi.fn();
    const onEdgePointerLeave = vi.fn();
    const detach = attachGpuEdgeInteractionController({
      element,
      getScene: () => createEdgeScene(),
      onEdgePointerLeave,
      onEdgePointerMove,
      store,
    });

    dispatchPointer(surface, "pointermove", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });
    dispatchPointer(surface, "pointermove", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });
    dispatchPointer(element, "pointerleave", {
      button: 0,
      clientX: 150,
      clientY: 70,
      pointerId: 1,
    });

    expect(onEdgePointerMove).toHaveBeenCalledTimes(1);
    expect(onEdgePointerMove).toHaveBeenCalledWith({
      hit: expect.objectContaining({ edgeId: "edge-a" }),
      nativeEvent: expect.any(MouseEvent),
    });
    expect(onEdgePointerLeave).toHaveBeenCalledTimes(1);
    detach();
  });
});

function createEdgeScene(): GpuEdgeScene {
  const entry: GpuEdgeSceneEntry = {
    edgeId: "data:edge-a",
    family: "data",
    geometry: buildGpuEdgeGeometry({
      edgeId: "data:edge-a",
      source: { x: 0, y: 20 },
      target: { x: 100, y: 20 },
      type: "straight",
    }),
    selectable: true,
    sourceEdgeId: "edge-a",
    zIndex: 0,
  };
  return {
    edges: [entry],
    entries: [entry],
    hitTestEdges: [entry],
  };
}

function createGpuFlowSurface(): {
  readonly element: HTMLElement;
  readonly surface: HTMLElement;
} {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      bottom: 450,
      height: 400,
      left: 100,
      right: 700,
      top: 50,
      width: 600,
      x: 100,
      y: 50,
    }) as DOMRect;
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
): boolean {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: options.button,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: options.pointerId });
  return element.dispatchEvent(event);
}

function dispatchMouse(
  element: Element,
  type: string,
  options: {
    readonly button: number;
    readonly clientX: number;
    readonly clientY: number;
  },
): boolean {
  return element.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      button: options.button,
      cancelable: true,
      clientX: options.clientX,
      clientY: options.clientY,
    }),
  );
}
