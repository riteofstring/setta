import { vi } from "vitest";

export function createNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

export function createInteractionTextureManager() {
  return {
    markSurfaceTextureDirty: vi.fn(() => true),
    setSurfaceTexturePriority: vi.fn(),
  };
}

export function createAnimationClock() {
  let nowMs = 0;
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    cancelAnimationFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    }),
    flushNextFrame() {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("Expected a pending animation frame.");
      }
      callbacks.delete(frameId);
      nowMs += 16;
      callback(nowMs);
    },
    now: () => nowMs,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    }),
  };
}

export function createPointerEvent(
  type: string,
  init: {
    readonly buttons?: number | undefined;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
    height: { value: 1 },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
    pressure: { value: type === "pointerup" ? 0 : 0.5 },
    tangentialPressure: { value: 0 },
    tiltX: { value: 0 },
    tiltY: { value: 0 },
    twist: { value: 0 },
    width: { value: 1 },
  });
  return event;
}

export function setRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

export function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    readonly clientHeight: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  });
}
