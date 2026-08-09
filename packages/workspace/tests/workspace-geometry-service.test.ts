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
  pendingAnimationFrameCount(): number;
  flushAnimationFrames(): void;
  removeEventListener: ReturnType<typeof vi.fn>;
  requestAnimationFrame: ReturnType<typeof vi.fn>;
  window: Window;
}>;

function fakeWindow(): FakeWindowFixture {
  const instances: FakeResizeObserverInstance[] = [];
  const animationFrames: FrameRequestCallback[] = [];
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
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return 17;
  });
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
    flushAnimationFrames: () => {
      for (const callback of animationFrames.splice(0)) {
        callback(0);
      }
    },
    instances,
    pendingAnimationFrameCount: () => animationFrames.length,
    removeEventListener,
    requestAnimationFrame,
    window,
  };
}

async function flushNextAnimationFrame(fixture: FakeWindowFixture): Promise<void> {
  for (let turn = 0; turn < 4 && fixture.pendingAnimationFrameCount() === 0; turn += 1) {
    await Promise.resolve();
  }
  expect(fixture.pendingAnimationFrameCount()).toBeGreaterThan(0);
  fixture.flushAnimationFrames();
}

function fakeElement(
  window: Window,
  rect: Readonly<{ height: number; width: number; x: number; y: number }>,
  ownerDocument = { defaultView: window } as Document,
) {
  const addEventListener = vi.fn();
  let element: HTMLElement;
  const focus = vi.fn(() => {
    (ownerDocument as unknown as { activeElement: Element | null }).activeElement = element;
  });
  const getBoundingClientRect = vi.fn(() => rect as DOMRect);
  const removeEventListener = vi.fn();
  element = {
    addEventListener,
    contains: vi.fn(() => true),
    focus,
    getBoundingClientRect,
    ownerDocument,
    removeEventListener,
  } as unknown as HTMLElement;
  return { addEventListener, element, focus, getBoundingClientRect, removeEventListener };
}

describe("WorkspaceGeometryMeasurements lifecycle", () => {
  it("retains last measured geometry across a culled unmount and focuses the remounted frame", async () => {
    const fixture = fakeWindow();
    const ownerDocument = {
      activeElement: null,
      defaultView: fixture.window,
    } as unknown as Document;
    const canvas = fakeElement(
      fixture.window,
      { height: 500, width: 800, x: 50, y: 80 },
      ownerDocument,
    );
    const first = fakeElement(
      fixture.window,
      { height: 120, width: 200, x: 90, y: 140 },
      ownerDocument,
    );
    const second = fakeElement(
      fixture.window,
      { height: 120, width: 200, x: 90, y: 140 },
      ownerDocument,
    );
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);
    geometry.setRetainedSectionIds(["root"]);
    geometry.setCanvasElement(canvas.element);
    const unregisterFirst = geometry.register({
      depth: 0,
      element: first.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    unregisterFirst();

    expect(index.size).toBe(1);
    await expect(geometry.boundsWhenReady(["root"])).resolves.toEqual({
      height: 120,
      width: 200,
      x: 40,
      y: 60,
    });
    const focused = geometry.focusSectionWhenReady("root");
    const unregisterSecond = geometry.register({
      depth: 0,
      element: second.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });

    await expect(focused).resolves.toBe(true);
    expect(second.focus).toHaveBeenCalledOnce();
    expect(index.size).toBe(1);
    unregisterSecond();
    geometry.setRetainedSectionIds([]);
    expect(index.size).toBe(0);
    geometry.setCanvasElement(null);
  });

  it("serves measurement-pass canvas bounds without forcing a fresh layout read", () => {
    const fixture = fakeWindow();
    const canvas = fakeElement(fixture.window, { height: 500, width: 800, x: 50, y: 80 });
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);

    expect(() => geometry.measuredCanvasBounds()).toThrowError(
      "Workspace canvas geometry is unavailable before mount or after unmount.",
    );
    geometry.setCanvasElement(canvas.element);
    expect(() => geometry.measuredCanvasBounds()).toThrowError(
      "Workspace canvas bounds are unavailable before the first measurement pass.",
    );

    geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    const readsAfterPass = canvas.getBoundingClientRect.mock.calls.length;

    expect(geometry.measuredCanvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: 80 });
    expect(canvas.getBoundingClientRect.mock.calls.length).toBe(readsAfterPass);

    geometry.setCanvasElement(null);
    expect(() => geometry.measuredCanvasBounds()).toThrowError(
      "Workspace canvas geometry is unavailable before mount or after unmount.",
    );
  });

  it("re-measures canvas bounds after a document-level scroll settles", () => {
    const fixture = fakeWindow();
    const canvasRect = { height: 500, width: 800, x: 50, y: 80 };
    const canvas = fakeElement(fixture.window, canvasRect);
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);

    geometry.setCanvasElement(canvas.element);
    geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    expect(geometry.measuredCanvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: 80 });

    canvasRect.y = -1048;
    const scrollListener = fixture.addEventListener.mock.calls.find(
      ([type]) => type === "scroll",
    )?.[1] as () => void;
    expect(scrollListener).toBeTypeOf("function");
    scrollListener();
    geometry.settleMeasurement();
    expect(geometry.measuredCanvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: -1048 });

    geometry.setCanvasElement(null);
  });

  it("re-anchors canvas bounds from capture-phase input after a silent layout shift", () => {
    const fixture = fakeWindow();
    const canvasRect = { height: 500, width: 800, x: 50, y: 1208 };
    const canvas = fakeElement(fixture.window, canvasRect);
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 1268 });
    const index = new WorkspaceGeometryIndex();
    const geometry = new WorkspaceGeometryMeasurements(index);

    geometry.setCanvasElement(canvas.element);
    geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "root",
    });
    geometry.flushMeasurement();
    expect(geometry.measuredCanvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: 1208 });

    // Content above the canvas collapses: the canvas moves without any
    // scroll, resize, or observer notification.
    canvasRect.y = 80;
    const rafCallsAfterPass = fixture.requestAnimationFrame.mock.calls.length;
    const pointerDownListener = canvas.addEventListener.mock.calls.find(
      ([type]) => type === "pointerdown",
    )?.[1] as (event: Event) => void;
    expect(pointerDownListener).toBeTypeOf("function");
    const movementHandle = {} as Element;
    const readsBeforeIgnoredInput = canvas.getBoundingClientRect.mock.calls.length;
    pointerDownListener({
      button: 0,
      isPrimary: true,
      target: { closest: () => null },
      type: "pointerdown",
    } as unknown as PointerEvent);
    expect(canvas.getBoundingClientRect.mock.calls.length).toBe(readsBeforeIgnoredInput);

    pointerDownListener({
      button: 0,
      isPrimary: true,
      target: { closest: () => movementHandle },
      type: "pointerdown",
    } as unknown as PointerEvent);
    expect(geometry.measuredCanvasBounds()).toEqual({ height: 500, width: 800, x: 50, y: 80 });
    expect(fixture.requestAnimationFrame.mock.calls.length).toBe(rafCallsAfterPass + 1);
    geometry.settleMeasurement();

    // A repeat input with an unmoved canvas schedules no re-measure.
    pointerDownListener({
      button: 0,
      isPrimary: true,
      target: { closest: () => movementHandle },
      type: "pointerdown",
    } as unknown as PointerEvent);
    expect(fixture.requestAnimationFrame.mock.calls.length).toBe(rafCallsAfterPass + 1);

    geometry.setCanvasElement(null);
  });

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
    expect(fixture.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(fixture.requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(fixture.instances).toHaveLength(1);
    expect(fixture.instances[0]?.observe).toHaveBeenCalledWith(root.element);

    geometry.setCanvasElement(null);

    expect(index.size).toBe(0);
    expect(fixture.cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(fixture.instances[0]?.disconnect).toHaveBeenCalledOnce();
    expect(fixture.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(fixture.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
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

  it("focuses a newly registered frame and settles unavailable deferred focus", async () => {
    const fixture = fakeWindow();
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    const focused = geometry.focusSectionWhenReady("created");

    geometry.register({
      depth: 0,
      element: root.element,
      order: 0,
      parentSectionId: null,
      sectionId: "created",
    });

    await expect(focused).resolves.toBe(true);
    expect(root.focus).toHaveBeenCalledWith({ preventScroll: true });

    const unavailable = geometry.focusSectionWhenReady("missing");
    geometry.setCanvasElement(null);
    await expect(unavailable).resolves.toBe(false);
  });

  it("hands structural focus from a registered frame to its native selection control", async () => {
    const fixture = fakeWindow();
    const root = fakeElement(fixture.window, { height: 120, width: 200, x: 90, y: 140 });
    const selection = fakeElement(fixture.window, { height: 40, width: 40, x: 98, y: 148 });
    root.element.querySelector = vi.fn(() => selection.element) as never;
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    const focused = geometry.focusSelectionControlWhenReady("group");

    geometry.register({
      depth: 2,
      element: root.element,
      order: 0,
      parentSectionId: "parent",
      sectionId: "group",
    });
    for (let frame = 1; frame <= 2; frame += 1) {
      for (
        let turn = 0;
        turn < 3 && fixture.requestAnimationFrame.mock.calls.length < frame;
        turn += 1
      ) {
        await Promise.resolve();
      }
      expect(fixture.requestAnimationFrame).toHaveBeenCalledTimes(frame);
      fixture.flushAnimationFrames();
    }

    await expect(focused).resolves.toBe(true);
    expect(root.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(root.element.querySelector).toHaveBeenCalledWith("[data-workspace-selection-control]");
    expect(selection.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("recovers focus when the active section is removed or becomes a nested descendant", async () => {
    const fixture = fakeWindow();
    const body = { isConnected: true } as HTMLElement;
    const documentElement = { isConnected: true } as HTMLElement;
    const documentState = {
      activeElement: body as Element | null,
      body,
      defaultView: fixture.window,
      documentElement,
    };
    const ownerDocument = documentState as unknown as Document;
    const canvas = fakeElement(
      fixture.window,
      { height: 500, width: 800, x: 0, y: 0 },
      ownerDocument,
    );
    const alpha = fakeElement(
      fixture.window,
      { height: 120, width: 200, x: 40, y: 60 },
      ownerDocument,
    );
    const group = fakeElement(
      fixture.window,
      { height: 240, width: 320, x: 40, y: 60 },
      ownerDocument,
    );
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    geometry.setCanvasElement(canvas.element);
    geometry.register({
      depth: 0,
      element: alpha.element,
      order: 0,
      parentSectionId: null,
      sectionId: "alpha",
    });
    geometry.register({
      depth: 0,
      element: group.element,
      order: 1,
      parentSectionId: null,
      sectionId: "group",
    });

    const survivingAnchor = {
      closest: () => ({ getAttribute: () => "alpha" }),
      isConnected: true,
    } as unknown as Element;
    documentState.activeElement = survivingAnchor;
    expect(geometry.captureFocus()).toBe(survivingAnchor);
    const preservedFocus = geometry.recoverFocus("alpha", survivingAnchor);
    fixture.flushAnimationFrames();
    await expect(preservedFocus).resolves.toBe(false);
    expect(alpha.focus).not.toHaveBeenCalled();

    const promotedFocus = geometry.recoverFocus("group", survivingAnchor);
    group.focus.mockImplementationOnce(() => {
      documentState.activeElement = body;
    });
    for (let frame = 0; frame < 3; frame += 1) {
      await flushNextAnimationFrame(fixture);
    }
    await expect(promotedFocus).resolves.toBe(true);
    expect(group.focus).toHaveBeenCalledTimes(2);
    expect(group.focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(documentState.activeElement).toBe(group.element);

    const removedAnchor = { isConnected: false } as Element;
    documentState.activeElement = canvas.element;
    const restoredFocus = geometry.recoverFocus("alpha", removedAnchor);
    for (let frame = 0; frame < 2; frame += 1) {
      await flushNextAnimationFrame(fixture);
    }
    await expect(restoredFocus).resolves.toBe(true);
    expect(alpha.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(documentState.activeElement).toBe(alpha.element);

    const unrelatedActiveElement = { isConnected: true } as Element;
    documentState.activeElement = unrelatedActiveElement;
    await expect(geometry.recoverFocus(null, removedAnchor)).resolves.toBe(false);
    expect(canvas.focus).not.toHaveBeenCalled();

    documentState.activeElement = body;
    await expect(geometry.recoverFocus(null, null)).resolves.toBe(true);
    expect(canvas.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe("WorkspaceGeometryMeasurements child regions", () => {
  function fakeRegionWindow(style: Readonly<Record<string, string>>) {
    const fixture = fakeWindow();
    const getComputedStyle = vi.fn(() => style);
    (fixture.window as unknown as { getComputedStyle: unknown }).getComputedStyle =
      getComputedStyle;
    const ownerDocument = {
      activeElement: null,
      defaultView: fixture.window,
    } as unknown as Document;
    return { fixture, getComputedStyle, ownerDocument };
  }

  function fakeRegionElement(
    window: Window,
    ownerDocument: Document,
    rect: Readonly<{ height: number; width: number; x: number; y: number }>,
    surface: HTMLElement | null,
  ) {
    const { element } = fakeElement(window, rect, ownerDocument);
    const querySelector = vi.fn(() => surface);
    (element as unknown as { querySelector: unknown }).querySelector = querySelector;
    return { element, querySelector };
  }

  it("measures registered child regions with gaps, direction, and surface geometry", async () => {
    const { fixture, getComputedStyle, ownerDocument } = fakeRegionWindow({
      columnGap: "12px",
      direction: "rtl",
      rowGap: "8px",
    });
    const canvas = fakeElement(
      fixture.window,
      { height: 600, width: 800, x: 100, y: 50 },
      ownerDocument,
    );
    const surface = fakeElement(
      fixture.window,
      { height: 100, width: 180, x: 170, y: 100 },
      ownerDocument,
    );
    const region = fakeRegionElement(
      fixture.window,
      ownerDocument,
      { height: 120, width: 200, x: 160, y: 90 },
      surface.element,
    );
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    geometry.setCanvasElement(canvas.element);
    geometry.registerChildRegion({ element: region.element, parentSectionId: "container" });
    expect(geometry.childRegions().get("container")).toBeNull();
    await flushNextAnimationFrame(fixture);

    const measured = geometry.childRegions().get("container");
    expect(measured).toMatchObject({
      columnGap: 12,
      direction: "rtl",
      parentSectionId: "container",
      rowGap: 8,
      surfaceWorkspaceRect: { height: 100, width: 180, x: 70, y: 50 },
      workspaceRect: { height: 120, width: 200, x: 60, y: 40 },
    });
    expect(measured?.surface).toBe(surface.element);
    expect(getComputedStyle).toHaveBeenCalledWith(region.element);
  });

  it("marks unparsable gaps as unavailable and defaults the direction", async () => {
    const { fixture, ownerDocument } = fakeRegionWindow({
      columnGap: "normal",
      direction: "",
      rowGap: "-4px",
    });
    const canvas = fakeElement(
      fixture.window,
      { height: 600, width: 800, x: 0, y: 0 },
      ownerDocument,
    );
    const region = fakeRegionElement(
      fixture.window,
      ownerDocument,
      { height: 120, width: 200, x: 20, y: 30 },
      null,
    );
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    geometry.setCanvasElement(canvas.element);
    geometry.registerChildRegion({ element: region.element, parentSectionId: "container" });
    await flushNextAnimationFrame(fixture);

    expect(geometry.childRegions().get("container")).toMatchObject({
      columnGap: null,
      direction: "ltr",
      rowGap: null,
      surface: null,
      surfaceWorkspaceRect: null,
    });
  });

  it("rejects duplicate registrations and supports re-registration after unregistering", async () => {
    const { fixture, ownerDocument } = fakeRegionWindow({
      columnGap: "0px",
      direction: "ltr",
      rowGap: "0px",
    });
    const canvas = fakeElement(
      fixture.window,
      { height: 600, width: 800, x: 0, y: 0 },
      ownerDocument,
    );
    const region = fakeRegionElement(
      fixture.window,
      ownerDocument,
      { height: 120, width: 200, x: 20, y: 30 },
      null,
    );
    const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
    geometry.setCanvasElement(canvas.element);
    const unregister = geometry.registerChildRegion({
      element: region.element,
      parentSectionId: "container",
    });
    expect(() =>
      geometry.registerChildRegion({ element: region.element, parentSectionId: "container" }),
    ).toThrow("Section container already has a measured child region.");
    unregister();
    expect(geometry.childRegions().size).toBe(0);
    geometry.registerChildRegion({ element: region.element, parentSectionId: "container" });
    await flushNextAnimationFrame(fixture);
    expect(geometry.childRegions().get("container")).not.toBeNull();
    geometry.setCanvasElement(null);
    expect(geometry.childRegions().size).toBe(0);
  });
});
