/* @vitest-environment jsdom */

import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  attachGpuPanZoomController,
  resolveGpuPanOnScrollDelta,
  shouldHandleGpuWheelEvent,
} from "./panZoom";

describe("GPU pan/zoom controller", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("resolves pan-on-scroll deltas using generated pan mode values", () => {
    expect(
      resolveGpuPanOnScrollDelta({
        event: wheelLike({ deltaMode: 1, deltaX: 2, deltaY: 3 }),
        isMacOS: true,
        panOnScrollMode: PanOnScrollModeEnum.free,
      }),
    ).toEqual({ deltaX: 40, deltaY: 60 });
    expect(
      resolveGpuPanOnScrollDelta({
        event: wheelLike({ deltaX: 2, deltaY: 3 }),
        isMacOS: false,
        panOnScrollMode: PanOnScrollModeEnum.horizontal,
      }),
    ).toEqual({ deltaX: 2, deltaY: 0 });
    expect(
      resolveGpuPanOnScrollDelta({
        event: wheelLike({ deltaX: 2, deltaY: 3 }),
        isMacOS: false,
        panOnScrollMode: PanOnScrollModeEnum.vertical,
      }),
    ).toEqual({ deltaX: 0, deltaY: 3 });
    expect(
      resolveGpuPanOnScrollDelta({
        event: wheelLike({ deltaX: 2, deltaY: 3, shiftKey: true }),
        isMacOS: false,
        panOnScrollMode: PanOnScrollModeEnum.free,
      }),
    ).toEqual({ deltaX: 3, deltaY: 0 });
  });

  it("preserves native nowheel targets unless zoom is explicitly activated", () => {
    const event = dispatchWheelFromClass(NO_WHEEL_CLASS_NAME);

    expect(
      shouldHandleGpuWheelEvent({
        event,
        isMacOS: false,
        panOnScroll: false,
        preventScrolling: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
    expect(
      shouldHandleGpuWheelEvent({
        event,
        isMacOS: false,
        panOnScroll: false,
        preventScrolling: true,
        zoomActivationKeyPressed: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(true);
  });

  it("preserves native nopan targets when plain pan-on-scroll would own the gesture", () => {
    const event = dispatchWheelFromClass(NO_PAN_CLASS_NAME);

    expect(
      shouldHandleGpuWheelEvent({
        event,
        isMacOS: false,
        panOnScroll: true,
        preventScrolling: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
    expect(
      shouldHandleGpuWheelEvent({
        event,
        isMacOS: false,
        panOnScroll: true,
        preventScrolling: true,
        zoomActivationKeyPressed: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(true);
  });

  it("zooms around the wheel point and requests a viewport frame", () => {
    vi.useFakeTimers();
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    const requestFrame = vi.fn();
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      requestFrame,
      store,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 80,
      deltaMode: 0,
      deltaY: -100,
    });
    element.dispatchEvent(event);

    const [x, y, zoom] = store.getState().transform;
    expect(event.defaultPrevented).toBe(true);
    expect(zoom).toBeGreaterThan(1);
    expect(x).toBeCloseTo(100 - 100 * zoom);
    expect(y).toBeCloseTo(80 - 80 * zoom);
    expect(store.getState().wheelZooming).toBe(true);
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    vi.advanceTimersByTime(180);
    expect(store.getState().wheelZooming).toBe(false);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    detach();
  });

  it("lets pan-on-scroll own plain wheel when zoom-on-scroll is also enabled", () => {
    vi.useFakeTimers();
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const requestFrame = vi.fn();
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      panOnScroll: true,
      requestFrame,
      store,
      zoomOnScroll: true,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 10,
        deltaY: 20,
      }),
    );

    expect(store.getState().transform).toEqual([-5, -10, 1]);
    expect(store.getState().panScrolling).toBe(true);
    expect(store.getState().wheelZooming).toBe(false);
    vi.advanceTimersByTime(150);
    expect(store.getState().panScrolling).toBe(false);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    detach();
  });

  it("lets pinch zoom win over pan-on-scroll", () => {
    vi.useFakeTimers();
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    const requestFrame = vi.fn();
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: true,
      panOnScroll: true,
      requestFrame,
      store,
      zoomOnPinch: true,
      zoomOnScroll: true,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 90,
        ctrlKey: true,
        deltaY: -20,
      }),
    );

    const [x, y, zoom] = store.getState().transform;
    expect(zoom).toBeGreaterThan(1);
    expect(x).toBeCloseTo(120 - 120 * zoom);
    expect(y).toBeCloseTo(90 - 90 * zoom);
    expect(store.getState().wheelZooming).toBe(true);
    expect(store.getState().panScrolling).toBe(false);
    vi.advanceTimersByTime(180);
    expect(store.getState().wheelZooming).toBe(false);
    detach();
  });

  it("lets the zoom activation key win over pan-on-scroll", () => {
    vi.useFakeTimers();
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      height: 400,
      transform: [0, 0, 1],
      width: 600,
    });
    const requestFrame = vi.fn();
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      panOnScroll: true,
      requestFrame,
      store,
      zoomActivationKeyPressed: true,
      zoomOnScroll: false,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 30,
        deltaY: -100,
      }),
    );

    const [x, y, zoom] = store.getState().transform;
    expect(zoom).toBeGreaterThan(1);
    expect(x).toBeCloseTo(40 - 40 * zoom);
    expect(y).toBeCloseTo(30 - 30 * zoom);
    expect(store.getState().wheelZooming).toBe(true);
    expect(store.getState().panScrolling).toBe(false);
    vi.advanceTimersByTime(180);
    expect(store.getState().wheelZooming).toBe(false);
    detach();
  });

  it("pans by pointer movement from the background but not primary node drags", () => {
    const element = createSurfaceElement();
    const node = document.createElement("div");
    node.className = "setta-gpu-flow__node";
    element.append(node);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      requestFrame: vi.fn(),
      store,
    });

    dispatchPointer(node, "pointerdown", {
      button: 0,
      clientX: 1,
      clientY: 1,
      pointerId: 1,
    });
    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    expect(store.getState().transform).toEqual([0, 0, 1]);

    dispatchPointer(element, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 2,
    });
    expect(store.getState().paneDragging).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(true);
    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 15,
      clientY: 17,
      pointerId: 2,
    });
    expect(store.getState().transform).toEqual([5, 7, 1]);
    dispatchPointer(element, "pointerup", {
      button: 0,
      clientX: 15,
      clientY: 17,
      pointerId: 2,
    });
    expect(store.getState().paneDragging).toBe(false);
    expect(store.getState().viewportInteractionActive).toBe(false);
    detach();
  });

  it("requests viewport frames during pointer pan and defers texture upload until pan end", () => {
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 2],
    });
    const requestFrame = vi.fn();
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      requestFrame,
      store,
    });

    dispatchPointer(element, "pointerdown", {
      button: 0,
      clientX: 20,
      clientY: 30,
      pointerId: 1,
    });
    expect(store.getState().paneDragging).toBe(true);
    expect(store.getState().pointerPanning).toBe(true);
    expect(requestFrame).not.toHaveBeenCalled();

    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 25,
      clientY: 28,
      pointerId: 1,
    });
    expect(store.getState().transform).toEqual([5, -2, 2]);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenLastCalledWith("viewport");

    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 25,
      clientY: 28,
      pointerId: 1,
    });
    expect(requestFrame).toHaveBeenCalledTimes(1);

    dispatchPointer(element, "pointerup", {
      button: 0,
      clientX: 25,
      clientY: 28,
      pointerId: 1,
    });
    expect(store.getState().paneDragging).toBe(false);
    expect(store.getState().pointerPanning).toBe(false);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    detach();
  });

  it("pans primary node drags while the pan activation key is active", () => {
    const element = createSurfaceElement();
    const node = document.createElement("div");
    node.className = "setta-gpu-flow__node";
    element.append(node);
    const noPanChild = document.createElement("div");
    noPanChild.className = NO_PAN_CLASS_NAME;
    node.append(noPanChild);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      panActivationKeyPressed: true,
      panOnDrag: false,
      requestFrame: vi.fn(),
      store,
    });

    dispatchPointer(node, "pointerdown", {
      button: 0,
      clientX: 1,
      clientY: 1,
      pointerId: 1,
    });
    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 10,
      clientY: 12,
      pointerId: 1,
    });
    expect(store.getState().transform).toEqual([9, 11, 1]);
    dispatchPointer(element, "pointerup", {
      button: 0,
      clientX: 10,
      clientY: 12,
      pointerId: 1,
    });

    dispatchPointer(noPanChild, "pointerdown", {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 2,
    });
    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 30,
      clientY: 30,
      pointerId: 2,
    });
    expect(store.getState().transform).toEqual([9, 11, 1]);
    detach();
  });

  it("does not start background panning while the selection key is active", () => {
    const element = createSurfaceElement();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    store.getState().setSelectionKeyPressed(true);
    const detach = attachGpuPanZoomController({
      element,
      isMacOS: false,
      requestFrame: vi.fn(),
      store,
    });

    dispatchPointer(element, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    dispatchPointer(element, "pointermove", {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });

    expect(store.getState().transform).toEqual([0, 0, 1]);
    expect(store.getState().paneDragging).toBe(false);
    detach();
  });
});

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

function dispatchWheelFromClass(className: string): WheelEvent {
  const target = document.createElement("div");
  target.className = className;
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -50,
  });
  target.dispatchEvent(event);
  return event;
}

function wheelLike(
  options: Partial<
    Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY" | "shiftKey">
  >,
): Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY" | "shiftKey"> {
  return {
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    shiftKey: false,
    ...options,
  };
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
