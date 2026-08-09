import { describe, expect, it, vi } from "vitest";

import {
  resolveWorkspaceViewportCullingOptions,
  WorkspaceViewportCulling,
} from "../src/internal/workspace-viewport-culling.js";

type FakeObserver = Readonly<{
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options: IntersectionObserverInit | undefined;
  trigger(element: Element, isIntersecting: boolean): void;
  unobserve: ReturnType<typeof vi.fn>;
}>;

function cullingFixture() {
  const observers: FakeObserver[] = [];
  class FakeIntersectionObserver {
    readonly #callback: IntersectionObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly options: IntersectionObserverInit | undefined;
    readonly unobserve = vi.fn();

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.#callback = callback;
      this.options = options;
      observers.push(this);
    }

    trigger(element: Element, isIntersecting: boolean): void {
      this.#callback(
        [{ isIntersecting, target: element } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
  }
  const window = { IntersectionObserver: FakeIntersectionObserver } as unknown as Window;
  const ownerDocument = { defaultView: window } as Document;
  const canvas = { ownerDocument } as HTMLElement;
  const element = (id: string) => ({ id, ownerDocument }) as HTMLElement;
  return { canvas, element, observers };
}

describe("workspace viewport culling", () => {
  it("strictly resolves an opt-in CSS-pixel overscan policy", () => {
    expect(resolveWorkspaceViewportCullingOptions(undefined)).toEqual({
      enabled: false,
      overscan: 160,
    });
    expect(resolveWorkspaceViewportCullingOptions({ enabled: true, overscan: 48 })).toEqual({
      enabled: true,
      overscan: 48,
    });
    expect(() => resolveWorkspaceViewportCullingOptions({ overscan: -1 })).toThrow(
      "overscan must be a finite non-negative number",
    );
    expect(() => resolveWorkspaceViewportCullingOptions({ enabled: "yes" } as never)).toThrow(
      "enabled must be a boolean",
    );
    expect(() => resolveWorkspaceViewportCullingOptions({ threshold: 2 } as never)).toThrow(
      "Unknown workspace viewport culling option threshold",
    );
    expect(() =>
      resolveWorkspaceViewportCullingOptions(
        Object.defineProperty({}, "enabled", { enumerable: true, get: () => true }),
      ),
    ).toThrow("Unknown workspace viewport culling option enabled");
  });

  it("shares one observer and force-reveals a target ancestry path", () => {
    const fixture = cullingFixture();
    const culling = new WorkspaceViewportCulling();
    const root = fixture.element("root");
    const child = fixture.element("child");
    const rootListener = vi.fn();
    const childListener = vi.fn();
    culling.setParentLookup(
      new Map([
        ["root", null],
        ["child", "root"],
      ]),
    );
    culling.setOptions(resolveWorkspaceViewportCullingOptions({ enabled: true, overscan: 80 }));
    culling.setCanvasElement(fixture.canvas);
    const unsubscribeRoot = culling.subscribe("root", rootListener);
    const unsubscribeChild = culling.subscribe("child", childListener);
    const unregisterRoot = culling.register({
      element: root,
      measureSize: () => ({ height: 160, width: 240 }),
      sectionId: "root",
    });
    const unregisterChild = culling.register({
      element: child,
      measureSize: () => ({ height: 80, width: 120 }),
      sectionId: "child",
    });

    expect(fixture.observers).toHaveLength(1);
    expect(fixture.observers[0]?.options).toMatchObject({
      root: fixture.canvas,
      rootMargin: "80px",
    });
    expect(fixture.observers[0]?.observe).toHaveBeenCalledTimes(2);
    fixture.observers[0]?.trigger(root, false);
    fixture.observers[0]?.trigger(child, false);
    expect(culling.snapshot("root")).toEqual({
      render: false,
      size: { height: 160, width: 240 },
    });
    expect(culling.snapshot("child")).toEqual({
      render: false,
      size: { height: 80, width: 120 },
    });

    const release = culling.revealSection("child");
    expect(culling.snapshot("root").render).toBe(true);
    expect(culling.snapshot("child").render).toBe(true);
    release();
    release();
    expect(culling.snapshot("root").render).toBe(false);
    expect(culling.snapshot("child").render).toBe(false);
    expect(rootListener).toHaveBeenCalledTimes(4);
    expect(childListener).toHaveBeenCalledTimes(4);

    unregisterChild();
    unregisterRoot();
    unsubscribeChild();
    unsubscribeRoot();
    culling.setCanvasElement(null);
    expect(fixture.observers[0]?.unobserve).toHaveBeenCalledTimes(2);
    expect(fixture.observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps a focused reveal path rendered after the controller reveal releases", () => {
    const fixture = cullingFixture();
    const culling = new WorkspaceViewportCulling();
    const root = fixture.element("root");
    const child = fixture.element("child");
    culling.setParentLookup(
      new Map([
        ["root", null],
        ["child", "root"],
      ]),
    );
    culling.setOptions(resolveWorkspaceViewportCullingOptions({ enabled: true }));
    culling.setCanvasElement(fixture.canvas);
    const unregisterRoot = culling.register({
      element: root,
      measureSize: () => ({ height: 160, width: 240 }),
      sectionId: "root",
    });
    const unregisterChild = culling.register({
      element: child,
      measureSize: () => ({ height: 80, width: 120 }),
      sectionId: "child",
    });
    fixture.observers[0]?.trigger(root, false);
    fixture.observers[0]?.trigger(child, false);

    const release = culling.revealSection("child");
    culling.setSectionFocusWithin("root", true);
    culling.setSectionFocusWithin("child", true);
    release();
    expect(culling.snapshot("root").render).toBe(true);
    expect(culling.snapshot("child").render).toBe(true);

    culling.setSectionFocusWithin("child", false);
    culling.setSectionFocusWithin("root", false);
    expect(culling.snapshot("root").render).toBe(false);
    expect(culling.snapshot("child").render).toBe(false);
    unregisterChild();
    unregisterRoot();
    culling.setCanvasElement(null);
  });

  it("fails specifically when the enabled browser surface lacks IntersectionObserver", () => {
    const culling = new WorkspaceViewportCulling();
    culling.setOptions(resolveWorkspaceViewportCullingOptions({ enabled: true }));
    const canvas = { ownerDocument: { defaultView: {} } } as HTMLElement;
    expect(() => culling.setCanvasElement(canvas)).toThrow(
      "Workspace viewport culling requires IntersectionObserver support",
    );
  });
});
