/* @vitest-environment jsdom */

import { NO_DRAG_CLASS_NAME } from "utils/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GpuEdgeReconnectAnchor,
  GpuEdgeScene,
} from "../edges/edgeSources";
import type { Connection } from "../flowTypes";
import { createGpuFlowLayoutStore } from "../layoutStore";
import type { GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuEdgeReconnectController,
  hitTestGpuEdgeReconnectAnchorInteraction,
} from "./edgeReconnect";

const handlePointerDownMock = vi.hoisted(() => vi.fn());

vi.mock("../Handle/handler", () => ({
  handlePointerDown: handlePointerDownMock,
}));

describe("GPU edge reconnect controller", () => {
  afterEach(() => {
    handlePointerDownMock.mockReset();
    document.body.innerHTML = "";
  });

  it("hit-tests reconnect anchors in flow space through the viewport", () => {
    const { element } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);

    const hit = hitTestGpuEdgeReconnectAnchorInteraction({
      event: { clientX: 210, clientY: 70 },
      getScene: () => createEdgeScene(),
      store,
    });

    expect(hit).toMatchObject({
      anchor: expect.objectContaining({
        edgeId: "edge-a",
        endpoint: "source",
        id: "data-edge-reconnect:edge-a:source",
      }),
      distance: 0,
      flowPoint: { x: 50, y: 20 },
      screenPoint: { x: 110, y: 20 },
      zIndex: 4,
    });
  });

  it("starts reconnect from the fixed opposite endpoint without a DOM anchor", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const onReconnect = vi.fn();
    const isValidConnection = vi.fn(() => true);
    const autoPanInsetsPx = () => ({ left: 24, right: 48 });
    const flowScene = createFlowScene();
    const detach = attachGpuEdgeReconnectController({
      autoPanInsetsPx,
      element,
      getFlowScene: () => flowScene,
      getScene: () => createEdgeScene(),
      isValidConnection,
      layoutStore,
      onReconnect,
      store,
    });

    const prevented = !dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 210,
      clientY: 70,
      pointerId: 1,
    });

    expect(prevented).toBe(true);
    expect(handlePointerDownMock).toHaveBeenCalledTimes(1);
    const call = handlePointerDownMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      edgeUpdaterType: "target",
      handleId: "in",
      isTarget: true,
      layoutStore,
      nodeId: "target",
      store,
    });
    expect(call.autoPanInsetsPx).toBe(autoPanInsetsPx);
    expect(call.getScene()).toBe(flowScene);
    expect(call.isValidConnection).toBe(isValidConnection);

    const connection: Connection = {
      source: "new-source",
      sourceHandle: "new-out",
      target: "target",
      targetHandle: "in",
    };
    call.onConnect(connection);

    expect(onReconnect).toHaveBeenCalledWith("edge-a", connection);
    detach();
  });

  it("does not start reconnect when disabled, non-primary, or over ignored targets", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const detachDisabled = attachGpuEdgeReconnectController({
      disabled: () => true,
      element,
      getScene: () => createEdgeScene(),
      layoutStore,
      onReconnect: vi.fn(),
      store,
    });

    const disabledNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 210,
      clientY: 70,
      pointerId: 1,
    });
    detachDisabled();

    const detachActive = attachGpuEdgeReconnectController({
      element,
      getScene: () => createEdgeScene(),
      layoutStore,
      onReconnect: vi.fn(),
      store,
    });
    const nonPrimaryNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 2,
      clientX: 210,
      clientY: 70,
      pointerId: 2,
    });
    const ignoredTarget = document.createElement("div");
    ignoredTarget.className = NO_DRAG_CLASS_NAME;
    ignoredTarget.dataset.gpuFlowSurface = "true";
    element.append(ignoredTarget);
    dispatchPointer(ignoredTarget, "pointerdown", {
      button: 0,
      clientX: 210,
      clientY: 70,
      pointerId: 3,
    });

    expect(disabledNotPrevented).toBe(true);
    expect(nonPrimaryNotPrevented).toBe(true);
    expect(handlePointerDownMock).not.toHaveBeenCalled();
    detachActive();
  });
});

function createEdgeScene(): GpuEdgeScene {
  return {
    edges: [],
    entries: [],
    hitTestEdges: [],
    labels: [],
    reconnectAnchors: [sourceAnchor()],
  };
}

function createFlowScene(): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function sourceAnchor(): GpuEdgeReconnectAnchor {
  return {
    edgeId: "edge-a",
    endpoint: "source",
    fixedHandleId: "in",
    fixedHandleType: "target",
    fixedIsTarget: true,
    fixedSectionId: "target",
    id: "data-edge-reconnect:edge-a:source",
    radius: 12,
    x: 50,
    y: 20,
    zIndex: 4,
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
