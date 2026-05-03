/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "../flowTypes";
import { createGpuFlowLayoutStore } from "../layoutStore";
import type { GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuScenePortConnectionController,
  hitTestGpuScenePortConnection,
} from "./scenePortConnection";

const handlePointerDownMock = vi.hoisted(() => vi.fn());

vi.mock("../Handle/handler", () => ({
  handlePointerDown: handlePointerDownMock,
}));

describe("GPU scene port connection controller", () => {
  afterEach(() => {
    handlePointerDownMock.mockReset();
    document.body.innerHTML = "";
  });

  it("hit-tests section scene port anchors in flow space through the viewport", () => {
    const { element } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);

    const hit = hitTestGpuScenePortConnection({
      event: {
        clientX: 432,
        clientY: 220,
      },
      getScene: () => createFlowScene(),
      store,
    });

    expect(hit).toMatchObject({
      anchor: expect.objectContaining({
        id: "out",
        kind: "output",
      }),
      flowPoint: { x: 161, y: 95 },
      screenPoint: { x: 332, y: 170 },
      section: expect.objectContaining({
        sectionId: "section-1",
      }),
      start: {
        handleId: "out",
        ownerSectionId: "section-1",
        type: "source",
      },
    });
  });

  it("starts a handle gesture from a section scene port without a DOM handle", () => {
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
        start.handleId === "out" && candidate.handleId === "in",
    );
    const autoPanInsetsPx = () => ({ left: 24, right: 48 });
    const detach = attachGpuScenePortConnectionController({
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
      clientX: 432,
      clientY: 220,
      pointerId: 1,
    });

    expect(prevented).toBe(true);
    expect(handlePointerDownMock).toHaveBeenCalledTimes(1);
    const call = handlePointerDownMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      edgeUpdaterType: "source",
      handleId: "out",
      isTarget: false,
      layoutStore,
      nodeId: "section-1",
      store,
    });
    expect(call.autoPanInsetsPx).toBe(autoPanInsetsPx);
    expect(call.getScene()).toBe(scene);
    expect(call.isValidConnection).toBe(isValidConnection);
    expect(
      call.isConnectionCandidateAllowed({
        handleId: "in",
        sectionId: "section-2",
        type: "target",
      }),
    ).toBe(true);
    expect(isConnectionCandidateAllowed).toHaveBeenCalledWith(
      {
        handleId: "in",
        sectionId: "section-2",
        type: "target",
      },
      {
        handleId: "out",
        ownerSectionId: "section-1",
        type: "source",
      },
    );

    const connection: Connection = {
      source: "section-1",
      sourceHandle: "out",
      target: "section-2",
      targetHandle: "in",
    };
    call.onConnect(connection, { scene });

    expect(onConnect).toHaveBeenCalledWith(connection, { scene });
    detach();
  });

  it("starts target gestures from section scene input anchors", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const detach = attachGpuScenePortConnectionController({
      element,
      getScene: () => createFlowScene(),
      layoutStore,
      onConnect: vi.fn(),
      store,
    });

    const prevented = !dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 188,
      clientY: 160,
      pointerId: 1,
    });

    expect(prevented).toBe(true);
    expect(handlePointerDownMock).toHaveBeenCalledTimes(1);
    expect(handlePointerDownMock.mock.calls[0]?.[0]).toMatchObject({
      edgeUpdaterType: "target",
      handleId: "in",
      isTarget: true,
      nodeId: "section-1",
    });
    detach();
  });

  it("ignores disabled, non-primary, and non-port pointer starts", () => {
    const { element, surface } = createGpuFlowSurface();
    const store = createGpuFlowViewportStore({
      transform: [10, -20, 2],
    });
    store.getState().setDomNode(element);
    const layoutStore = createGpuFlowLayoutStore();
    const detachDisabled = attachGpuScenePortConnectionController({
      disabled: () => true,
      element,
      getScene: () => createFlowScene(),
      layoutStore,
      onConnect: vi.fn(),
      store,
    });

    const disabledNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 432,
      clientY: 220,
      pointerId: 1,
    });
    detachDisabled();

    const detachActive = attachGpuScenePortConnectionController({
      element,
      getScene: () => createFlowScene(),
      layoutStore,
      onConnect: vi.fn(),
      store,
    });
    const nonPrimaryNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 2,
      clientX: 432,
      clientY: 220,
      pointerId: 2,
    });
    const nonPortNotPrevented = dispatchPointer(surface, "pointerdown", {
      button: 0,
      clientX: 500,
      clientY: 90,
      pointerId: 3,
    });

    expect(disabledNotPrevented).toBe(true);
    expect(nonPrimaryNotPrevented).toBe(true);
    expect(nonPortNotPrevented).toBe(true);
    expect(handlePointerDownMock).not.toHaveBeenCalled();
    detachActive();
  });
});

function createFlowScene(): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [
      {
        bodyRect: { height: 100, width: 120, x: 40, y: 40 },
        childLayout: { gap: { x: 0, y: 0 } },
        childSectionIds: [],
        childViewportRect: null,
        chromeRect: { height: 100, width: 120, x: 40, y: 40 },
        clipRect: { height: 100, width: 120, x: 40, y: 40 },
        contentRenderer: { kind: "dom-section", surfaceId: "section-1" },
        dirty: [],
        height: 100,
        interactionLayer: "content",
        layoutMode: "none",
        localRect: { height: 100, width: 120, x: 40, y: 40 },
        nodeId: "section-1",
        parentSectionId: null,
        portAnchors: [
          {
            id: "in",
            kind: "input",
            localPosition: { x: -1, y: 25 },
          },
          {
            id: "out",
            kind: "output",
            localPosition: { x: 121, y: 55 },
          },
        ],
        resizePolicy: {
          aspectRatio: false,
          aspectRatioExtraHeight: 0,
          aspectRatioExtraWidth: 0,
          directions: [],
          locked: false,
          maxHeight: Number.POSITIVE_INFINITY,
          maxWidth: Number.POSITIVE_INFINITY,
          minHeight: 0,
          minWidth: 0,
        },
        scrollOffset: { x: 0, y: 0 },
        sectionId: "section-1",
        width: 120,
        worldRect: { height: 100, width: 120, x: 40, y: 40 },
        x: 40,
        y: 40,
        zIndex: 2,
      },
    ],
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
