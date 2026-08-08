import { describe, expect, it, vi } from "vitest";

import { WorkspaceGeometryIndex } from "../src/internal/geometry-index.js";
import { WorkspaceGeometryMeasurements } from "../src/internal/workspace-geometry-service.js";

type FakeResizeObserverInstance = Readonly<{
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  trigger(): void;
  unobserve: ReturnType<typeof vi.fn>;
}>;

type FakeWindowFixture = Readonly<{
  addEventListener: ReturnType<typeof vi.fn>;
  cancelAnimationFrame: ReturnType<typeof vi.fn>;
  instances: FakeResizeObserverInstance[];
  removeEventListener: ReturnType<typeof vi.fn>;
  requestAnimationFrame: ReturnType<typeof vi.fn>;
  window: Window;
}>;

function fakeWindow(): FakeWindowFixture {
  const instances: FakeResizeObserverInstance[] = [];
  class FakeResizeObserver {
    readonly #callback: ResizeObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly unobserve = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
      instances.push(this);
    }

    trigger(): void {
      this.#callback([], this as unknown as ResizeObserver);
    }
  }

  const addEventListener = vi.fn();
  const cancelAnimationFrame = vi.fn();
  const removeEventListener = vi.fn();
  const requestAnimationFrame = vi.fn(() => 17);
  const window = {
    ResizeObserver: FakeResizeObserver,
    addEventListener,
    cancelAnimationFrame,
    removeEventListener,
    requestAnimationFrame,
  } as unknown as Window;
  return {
    addEventListener,
    cancelAnimationFrame,
    instances,
    removeEventListener,
    requestAnimationFrame,
    window,
  };
}

function fakeElement(
  window: Window,
  rect: Readonly<{ height: number; width: number; x: number; y: number }>,
) {
  const addEventListener = vi.fn();
  const getBoundingClientRect = vi.fn(() => rect as DOMRect);
  const removeEventListener = vi.fn();
  const element = {
    addEventListener,
    getBoundingClientRect,
    ownerDocument: { defaultView: window },
    removeEventListener,
  } as unknown as HTMLElement;
  return { addEventListener, element, getBoundingClientRect, removeEventListener };
}

describe("WorkspaceGeometryMeasurements lifecycle", () => {
  it("releases observers, listeners, frames, and scheduled work when the canvas detaches", () => {
    const fixture = fakeWindow();
    const canvas = fakeElement(fixture.window, { height: 500, width: 800, x: 50, y: 80 });
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);

    geometry.setCanvasElement(canvas.element);
    const unregister = geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    geometry.requestMeasurement();

    expect(index.size).toBe(1);
    expect(geometry.canvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: 80 });
    expect(fixture.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(canvas.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(fixture.requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(fixture.instances).toHaveLength(1);
    expect(fixture.instances[0]?.observe).toHaveBeenCalledWith(root.element);

    geometry.setCanvasElement(null);

    expect(index.size).toBe(0);
    expect(fixture.cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(fixture.instances[0]?.disconnect).toHaveBeenCalledOnce();
    expect(fixture.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(canvas.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(() => unregister()).not.toThrow();
    expect(() => fixture.instances[0]?.trigger()).not.toThrow();
    expect(fixture.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it("rejects pending readiness work and unsubscribes when an unmounted canvas never measures", async () => {
    const fixture = fakeWindow();
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const index = new WorkspaceGeometryIndex();
    const originalSubscribe = index.subscribe.bind(index);
    const unsubscribe = vi.fn();
    vi.spyOn(index, "subscribe").mockImplementation((listener) => {
      const dispose = originalSubscribe(listener);
      return () => {
        unsubscribe();
        dispose();
      };
    });
    const geometry = new WorkspaceGeometryMeasurements(index);
    const unregister = geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    const bounds = geometry.boundsWhenReady(["root"]);
    const viewport = geometry.waitForViewport({ x: 10, y: 20, zoom: 1.5 });

    geometry.setCanvasElement(null);

    await expect(bounds).rejects.toThrow("became unavailable before measurement");
    await expect(viewport).rejects.toThrow("became unavailable before the viewport synchronized");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fixture.instances[0]?.disconnect).toHaveBeenCalledOnce();
    expect(() => unregister()).not.toThrow();
  });

  it("can register fresh geometry after a Strict Mode-style detach and reattach", () => {
    const fixture = fakeWindow();
    const canvas = fakeElement(fixture.window, { height: 500, width: 800, x: 50, y: 80 });
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);

    geometry.setCanvasElement(canvas.element);
    const unregisterFirst = geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    geometry.setCanvasElement(null);
    unregisterFirst();
    geometry.setCanvasElement(canvas.element);
    const unregisterSecond = geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();

    expect(index.size).toBe(1);
    expect(fixture.instances).toHaveLength(2);
    unregisterSecond();
    geometry.setCanvasElement(null);
    expect(index.size).toBe(0);
  });

  it("reads shared canvas geometry once per batched measurement", () => {
    const fixture = fakeWindow();
    const canvas = fakeElement(fixture.window, { height: 500, width: 800, x: 50, y: 80 });
    const first = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const second = fakeElement(fixture.window, { height: 140, width: 220, x: 320, y: 180 });
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());

    geometry.setCanvasElement(canvas.element);
    geometry.register({
      depth: 0,
      element: first.element,
      order: 0,
      parentSectionId: null,
      sectionId: "first",
    });
    geometry.register({
      depth: 0,
      element: second.element,
      order: 1,
      parentSectionId: null,
      sectionId: "second",
    });
    expect(fixture.requestAnimationFrame).toHaveBeenCalledOnce();
    canvas.getBoundingClientRect.mockClear();
    first.getBoundingClientRect.mockClear();
    second.getBoundingClientRect.mockClear();

    geometry.flushMeasurement();

    expect(canvas.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(first.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(second.getBoundingClientRect).toHaveBeenCalledOnce();
  });

  it("settles superseded viewport synchronization requests", async () => {
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    const first = geometry.waitForViewport({ x: 10, y: 20, zoom: 1.5 });
    const second = geometry.waitForViewport({ x: 30, y: 40, zoom: 2 });

    geometry.completeViewport({ x: 30, y: 40, zoom: 2 });

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });
});
