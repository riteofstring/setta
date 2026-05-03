/* @vitest-environment jsdom */

import { NO_PAN_CLASS_NAME } from "utils/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "../flowTypes";
import { createGpuFlowLayoutStore } from "../layoutStore";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuRetainedContentConnectionController,
  hitTestGpuRetainedContentConnection,
} from "./retainedContentConnection";

const handlePointerDownMock = vi.hoisted(() => vi.fn());

vi.mock("../Handle/handler", () => ({
  handlePointerDown: handlePointerDownMock,
}));

describe("GPU retained content connection controller", () => {
  afterEach(() => {
    handlePointerDownMock.mockReset();
    document.body.innerHTML = "";
  });

  it("hit-tests retained port anchors in flow space through the viewport", () => {
    const { element } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);

    const hit = hitTestGpuRetainedContentConnection({
      element,
      event: {
        clientX: 190,
        clientY: 90,
        target: element,
      },
      getScene: () => createFlowScene(),
      store,
    });

    expect(hit).toMatchObject({
      anchor: expect.objectContaining({
        id: "param-in",
        kind: "input",
        ownerRowId: "param-1",
      }),
      flowPoint: { x: 40, y: 30 },
      localPoint: { x: 0, y: 10 },
      ownerSectionId: "section-1",
      start: {
        handleId: "param-in",
        ownerSectionId: "section-1",
        surfaceId: "surface-1",
        type: "target",
      },
      surfaceId: "surface-1",
    });
  });

  it("starts a handle gesture from a retained port without a DOM handle", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const scene = createFlowScene();
    const onConnect = vi.fn();
    const isValidConnection = vi.fn(() => true);
    const isConnectionCandidateAllowed = vi.fn(
      (candidate, start) =>
        start.handleId === "param-in" && candidate.handleId === "out",
    );
    const autoPanInsetsPx = () => ({ left: 24, right: 48 });
    const detach = attachGpuRetainedContentConnectionController({
      autoPanInsetsPx,
      element,
      getScene: () => scene,
      isConnectionCandidateAllowed,
      isValidConnection,
      layoutStore,
      onConnect,
      store,
    });

    const prevented = !dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 190,
      clientY: 90,
      pointerId: 1,
    });

    expect(prevented).toBe(true);
    expect(handlePointerDownMock).toHaveBeenCalledTimes(1);
    const call = handlePointerDownMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      edgeUpdaterType: "target",
      handleId: "param-in",
      isTarget: true,
      layoutStore,
      nodeId: "section-1",
      store,
    });
    expect(call.autoPanInsetsPx).toBe(autoPanInsetsPx);
    expect(call.getScene()).toBe(scene);
    expect(call.isValidConnection).toBe(isValidConnection);
    expect(
      call.isConnectionCandidateAllowed({
        handleId: "out",
        sectionId: "section-2",
        type: "source",
      }),
    ).toBe(true);
    expect(isConnectionCandidateAllowed).toHaveBeenCalledWith(
      {
        handleId: "out",
        sectionId: "section-2",
        type: "source",
      },
      {
        handleId: "param-in",
        ownerSectionId: "section-1",
        surfaceId: "surface-1",
        type: "target",
      },
    );

    const connection: Connection = {
      source: "section-2",
      sourceHandle: "out",
      target: "section-1",
      targetHandle: "param-in",
    };
    call.onConnect(connection, { scene });

    expect(onConnect).toHaveBeenCalledWith(connection, { scene });
    detach();
  });

  it("ignores disabled, non-primary, non-port, and native retained targets", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const detachDisabled = attachGpuRetainedContentConnectionController({
      disabled: () => true,
      element,
      getScene: () => createFlowScene(),
      layoutStore,
      onConnect: vi.fn(),
      store,
    });

    const disabledNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 190,
      clientY: 90,
      pointerId: 1,
    });
    detachDisabled();

    const detachActive = attachGpuRetainedContentConnectionController({
      element,
      getScene: () => createFlowScene(),
      layoutStore,
      onConnect: vi.fn(),
      store,
    });
    const nonPrimaryNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 2,
      clientX: 190,
      clientY: 90,
      pointerId: 2,
    });
    const nonPortNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 230,
      clientY: 90,
      pointerId: 3,
    });
    const nativeTarget = document.createElement("input");
    nativeTarget.className = NO_PAN_CLASS_NAME;
    element.append(nativeTarget);
    const nativeNotPrevented = dispatchPointer(nativeTarget, "pointerdown", {
      button: 0,
      clientX: 190,
      clientY: 90,
      pointerId: 4,
    });

    expect(disabledNotPrevented).toBe(true);
    expect(nonPrimaryNotPrevented).toBe(true);
    expect(nonPortNotPrevented).toBe(true);
    expect(nativeNotPrevented).toBe(true);
    expect(handlePointerDownMock).not.toHaveBeenCalled();
    detachActive();
  });
});

function createFlowScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  return {
    clipRect: { height: 80, width: 120, x: 40, y: 20 },
    id: "surface-1",
    ownerSectionId: "section-1",
    rect: { height: 40, width: 100, x: 40, y: 20 },
    renderer: { kind: "canvas-content", surfaceId: "surface-1" },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-1",
      ownerSectionId: "section-1",
      rowHeight: 20,
      rows: [
        {
          controlKind: null,
          depth: 0,
          id: "param-1",
          label: "Param 1",
          ports: [{ id: "param-in", kind: "input", side: "left" }],
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 40, width: 100, x: 0, y: 0 },
    }),
    zIndex: 2,
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
