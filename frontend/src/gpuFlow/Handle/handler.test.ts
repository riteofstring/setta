// @vitest-environment jsdom

import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandlePosition } from "../flowTypes";
import { createGpuFlowLayoutStore } from "../layoutStore";
import {
  makeGpuFlowPortKey,
  registerGpuFlowPortDescriptor,
  useGpuFlowPortRegistry,
} from "../ports/portGeometry";
import { createGpuFlowViewportStore } from "../viewportStore";
import { handlePointerDown } from "./handler";

describe("GPU edge handle connection lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mockElementFromPoint(null);
    mockElementsFromPoint([]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    useGpuFlowPortRegistry.getState().reset();
    vi.unstubAllGlobals();
  });

  it("cancels an active connection on Escape and ignores the later mouseup", () => {
    const { container, sourceHandle, targetHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    registerTargetHandle(targetHandle);
    mockElementFromPoint(sourceHandle);
    const onConnect = vi.fn();

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "out",
      isTarget: false,
      isValidConnection: () => true,
      layoutStore,
      nodeId: "source",
      onConnect,
      store,
    });
    expect(store.getState().connectionStartHandle).toEqual({
      handleId: "out",
      sectionId: "source",
      type: "source",
    });

    const escapeEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    const escapeNotPrevented = document.dispatchEvent(escapeEvent);

    expect(escapeNotPrevented).toBe(false);
    expect(store.getState().connectionStartHandle).toBeNull();

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 100,
      }),
    );

    expect(onConnect).not.toHaveBeenCalled();
  });

  it("clears valid-handle preview classes on browser cancel events", () => {
    const { container, sourceHandle, targetHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    registerTargetHandle(targetHandle);
    mockElementFromPoint(sourceHandle);
    mockElementsFromPoint([targetHandle]);
    const onConnect = vi.fn();

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "out",
      isTarget: false,
      isValidConnection: () => true,
      layoutStore,
      nodeId: "source",
      onConnect,
      store,
    });

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 100,
      }),
    );
    expect(
      targetHandle.classList.contains("setta-gpu-flow__handle-connecting"),
    ).toBe(true);
    expect(
      targetHandle.classList.contains("setta-gpu-flow__handle-valid"),
    ).toBe(true);
    expect(store.getState().connectionStatus).toBe("valid");

    const cancelEvent = new Event("pointercancel", {
      bubbles: true,
      cancelable: true,
    });
    const cancelNotPrevented = document.dispatchEvent(cancelEvent);

    expect(cancelNotPrevented).toBe(false);
    expect(
      targetHandle.classList.contains("setta-gpu-flow__handle-connecting"),
    ).toBe(false);
    expect(
      targetHandle.classList.contains("setta-gpu-flow__handle-valid"),
    ).toBe(false);
    expect(store.getState().connectionStartHandle).toBeNull();
    expect(store.getState().connectionStatus).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("cancels touch connections on touchcancel", () => {
    const { container, sourceHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    mockElementFromPoint(sourceHandle);
    const onConnect = vi.fn();

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "out",
      isTarget: false,
      isValidConnection: () => true,
      layoutStore,
      nodeId: "source",
      onConnect,
      store,
    });

    const cancelEvent = new Event("touchcancel", {
      bubbles: true,
      cancelable: true,
    });
    const cancelNotPrevented = document.dispatchEvent(cancelEvent);

    expect(cancelNotPrevented).toBe(false);
    expect(store.getState().connectionStartHandle).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("applies caller-owned candidate filtering before validating nearby handles", () => {
    const { container, sourceHandle, targetHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    registerTargetHandle(targetHandle);
    mockElementFromPoint(sourceHandle);
    mockElementsFromPoint([targetHandle]);
    const onConnect = vi.fn();
    const isConnectionCandidateAllowed = vi.fn(() => false);
    const isValidConnection = vi.fn(() => true);

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "out",
      isConnectionCandidateAllowed,
      isTarget: false,
      isValidConnection,
      layoutStore,
      nodeId: "source",
      onConnect,
      store,
    });

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 100,
      }),
    );
    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 100,
      }),
    );

    expect(isConnectionCandidateAllowed).toHaveBeenCalledWith({
      handleId: "in",
      sectionId: "target",
      type: "target",
    });
    expect(isValidConnection).not.toHaveBeenCalled();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("does not infer pointer-up snap radius from reverse handle ids", () => {
    const { container, sourceHandle, targetHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    registerTargetHandle(targetHandle);
    mockElementFromPoint(sourceHandle);
    mockElementsFromPoint([]);
    const onConnect = vi.fn();

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "reverse-start",
      isTarget: false,
      isValidConnection: () => true,
      layoutStore,
      nodeId: "source",
      onConnect,
      store,
    });

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: 250,
        clientY: 100,
      }),
    );

    expect(onConnect).not.toHaveBeenCalled();
  });

  it("uses caller-owned pointer-up snap radius when no active handle was tracked", () => {
    const { container, sourceHandle, targetHandle } = createHandleFixture();
    const store = createGpuFlowViewportStore();
    const layoutStore = createHandleLayoutStore();
    store.getState().setDomNode(container);
    registerTargetHandle(targetHandle);
    mockElementFromPoint(sourceHandle);
    mockElementsFromPoint([]);
    const onConnect = vi.fn();

    handlePointerDown({
      event: createReactMouseEvent(sourceHandle, "mousedown", {
        clientX: 110,
        clientY: 60,
      }),
      handleId: "reverse-start",
      isTarget: false,
      isValidConnection: () => true,
      layoutStore,
      nodeId: "source",
      onConnect,
      pointerUpSnapRadius: 80,
      store,
    });

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: 250,
        clientY: 100,
      }),
    );

    expect(onConnect).toHaveBeenCalledWith({
      source: "source",
      sourceHandle: "reverse-start",
      target: "target",
      targetHandle: "in",
    });
  });
});

function createHandleFixture(): {
  readonly container: HTMLElement;
  readonly sourceHandle: HTMLElement;
  readonly targetHandle: HTMLElement;
} {
  const container = document.createElement("div");
  container.getBoundingClientRect = () =>
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

  const sourceHandle = createHandleElement({
    handleId: "out",
    sectionId: "source",
    type: "source",
  });
  const targetHandle = createHandleElement({
    handleId: "in",
    sectionId: "target",
    type: "target",
  });

  container.append(sourceHandle, targetHandle);
  document.body.append(container);
  return { container, sourceHandle, targetHandle };
}

function createHandleElement({
  handleId,
  sectionId,
  type,
}: {
  readonly handleId: string;
  readonly sectionId: string;
  readonly type: "source" | "target";
}): HTMLElement {
  const element = document.createElement("div");
  element.className = [
    "setta-gpu-flow__handle",
    type,
    "connectable",
    "connectableend",
  ].join(" ");
  element.dataset.handleid = handleId;
  element.dataset.nodeid = sectionId;
  element.dataset.id = `${sectionId}-${handleId}-${type}`;
  return element;
}

function registerTargetHandle(targetHandle: HTMLElement) {
  expect(
    registerGpuFlowPortDescriptor({
      element: targetHandle,
      localRect: { height: 0, width: 0, x: 100, y: 50 },
      nodeId: "target",
      portId: "in",
      side: HandlePosition.Left,
      type: "target",
    }),
  ).toBe(makeGpuFlowPortKey("target", "in", "target"));
}

function createHandleLayoutStore() {
  return createGpuFlowLayoutStore({
    nodes: [
      {
        height: 100,
        nodeId: "source",
        width: 160,
        x: 0,
        y: 0,
      },
      {
        height: 100,
        nodeId: "target",
        width: 160,
        x: 0,
        y: 0,
      },
    ],
  });
}

function createReactMouseEvent(
  target: HTMLElement,
  type: string,
  options: MouseEventInit,
): ReactMouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  Object.defineProperty(event, "target", { value: target });
  return event as unknown as ReactMouseEvent;
}

function mockElementFromPoint(element: Element | null) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => element),
  });
}

function mockElementsFromPoint(elements: Element[]) {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn(() => elements),
  });
}
