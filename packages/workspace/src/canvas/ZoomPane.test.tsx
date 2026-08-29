/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import { useWorkspaceOptions } from "./options";
import {
  initialCanvasState,
  subscribeWorkspaceCanvasPanScrolling,
  useReactFlow,
} from "./store";
import ZoomPane, {
  getViewportInteractionActiveValue,
  isNativeVerticalWheelEvent,
  resetViewportInteractionState,
  resolvePanOnScrollDelta,
  shouldAllowZoomFilterEvent,
} from "./ZoomPane";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type RenderedZoomPane = {
  host: HTMLDivElement;
  renderer: HTMLDivElement;
  root: Root;
};

const zoomPaneOptions = {
  zoomOnScroll: true,
  zoomOnPinch: true,
  panOnScroll: false,
  panOnScrollSpeed: 0.5,
  panOnScrollMode: "free",
  zoomOnDoubleClick: true,
  panOnDrag: true,
  zoomActivationKeyPressed: false,
  wrapperDimensions: { width: 800, height: 600 },
} as const;

async function renderZoomPane(
  overrides: Partial<ComponentProps<typeof ZoomPane>> = {},
  workspace: WorkspaceTestHost = testWorkspace,
): Promise<RenderedZoomPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WorkspaceTestProvider workspace={workspace}>
        {
          <div className="react-flow">
            <ZoomPane {...zoomPaneOptions} {...overrides}>
              <div />
            </ZoomPane>
          </div>
        }
      </WorkspaceTestProvider>,
    );
  });

  const renderer = host.querySelector(".react-flow__renderer");
  if (!(renderer instanceof HTMLDivElement)) {
    throw new Error("ZoomPane test failed to render the viewport host.");
  }

  return { host, renderer, root };
}

function withEventTarget<T extends Event>(event: T, target: Element): T {
  Object.defineProperty(event, "target", {
    configurable: true,
    value: target,
  });
  return event;
}

function appendTargetWithClass(className: string): HTMLDivElement {
  const target = document.createElement("div");
  target.className = className;
  document.body.appendChild(target);
  return target;
}

function appendWorkspaceWindowManagerWheelTarget({
  host = testWorkspace.host,
  overlay = true,
  targetClassName = "",
}: {
  host?: WorkspaceTestHost["host"];
  overlay?: boolean;
  targetClassName?: string;
}) {
  const manager = document.createElement("div");
  manager.setAttribute("data-workspace-window-manager", "true");
  const window = document.createElement("article");
  window.className = overlay
    ? "setta-workspace-window-manager-window"
    : "setta-workspace-bottom-dock-panel";
  window.setAttribute("data-workspace-window-id", "window");
  const target = document.createElement("div");
  target.className = targetClassName;
  window.appendChild(target);
  manager.appendChild(window);
  document.body.appendChild(manager);

  return {
    manager,
    target,
    unregister: registerWorkspaceHostElement(host, manager),
  };
}

describe("resolvePanOnScrollDelta", () => {
  it("normalizes line-based wheel deltas and preserves shift remapping on non-mac", () => {
    const event = new WheelEvent("wheel", {
      deltaX: 2,
      deltaY: 3,
      shiftKey: true,
    });
    Object.defineProperty(event, "deltaMode", {
      configurable: true,
      value: 1,
    });

    expect(
      resolvePanOnScrollDelta({
        event,
        isMacOS: false,
        panOnScrollMode: "free",
      }),
    ).toEqual({
      deltaX: 60,
      deltaY: 0,
    });
  });

  it("zeros the excluded axis for constrained pan modes", () => {
    const event = new WheelEvent("wheel", {
      deltaX: 9,
      deltaY: 4,
    });

    expect(
      resolvePanOnScrollDelta({
        event,
        isMacOS: true,
        panOnScrollMode: "vertical",
      }),
    ).toEqual({
      deltaX: 0,
      deltaY: 4,
    });
    expect(
      resolvePanOnScrollDelta({
        event,
        isMacOS: true,
        panOnScrollMode: "horizontal",
      }),
    ).toEqual({
      deltaX: 9,
      deltaY: 0,
    });
  });
});

describe("shouldAllowZoomFilterEvent", () => {
  it("allows middle-click node panning when that button is enabled", () => {
    const node = appendTargetWithClass("react-flow__node");
    const event = withEventTarget(
      new MouseEvent("mousedown", { button: 1 }),
      node,
    );

    expect(
      shouldAllowZoomFilterEvent({
        event,
        host: testWorkspace.host,
        panOnDrag: [1],
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(true);
  });

  it("blocks nowheel targets from wheel zoom without an override", () => {
    const target = appendTargetWithClass("nowheel");
    const event = withEventTarget(
      new WheelEvent("wheel", { deltaY: -120 }),
      target,
    );

    expect(
      shouldAllowZoomFilterEvent({
        event,
        host: testWorkspace.host,
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });

  it("blocks manually consumed wheel targets from wheel zoom", () => {
    const target = appendTargetWithClass("setta-manual-wheel");
    const event = withEventTarget(
      new WheelEvent("wheel", { deltaY: -120 }),
      target,
    );

    expect(
      shouldAllowZoomFilterEvent({
        event,
        host: testWorkspace.host,
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });

  it("gives a vertical scroll surface only its vertical-dominant wheel input", () => {
    const target = appendTargetWithClass("setta-native-wheel-y");
    const verticalEvent = withEventTarget(
      new WheelEvent("wheel", { deltaX: 8, deltaY: 40 }),
      target,
    );
    const horizontalEvent = withEventTarget(
      new WheelEvent("wheel", { deltaX: 40, deltaY: 8 }),
      target,
    );
    const options = {
      panOnDrag: true,
      panOnScroll: true,
      userSelectionActive: false,
      zoomOnDoubleClick: true,
      zoomOnPinch: true,
      zoomOnScroll: false,
    } as const;

    expect(
      shouldAllowZoomFilterEvent({
        event: verticalEvent,
        host: testWorkspace.host,
        ...options,
      }),
    ).toBe(false);
    expect(
      shouldAllowZoomFilterEvent({
        event: horizontalEvent,
        host: testWorkspace.host,
        ...options,
      }),
    ).toBe(true);
  });

  it("reserves non-mac Shift plus vertical wheel input for horizontal canvas panning", () => {
    const target = appendTargetWithClass("setta-native-wheel-y");
    const event = withEventTarget(
      new WheelEvent("wheel", { deltaY: 40, shiftKey: true }),
      target,
    );

    expect(isNativeVerticalWheelEvent(event, false)).toBe(false);
    expect(isNativeVerticalWheelEvent(event, true)).toBe(true);
  });

  it("blocks pointer starts while the marquee selection is active", () => {
    expect(
      shouldAllowZoomFilterEvent({
        event: new MouseEvent("mousedown", { button: 0 }),
        host: testWorkspace.host,
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: true,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });
});

describe("getViewportInteractionActiveValue", () => {
  beforeEach(() => {
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.document.getState().reset();

    testWorkspace.document.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    document.body.innerHTML = "";
  });

  it("stays active while any gesture source is running", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: false,
      }),
    ).toBe(false);
  });

  it("clears gesture flags during teardown", () => {
    const panScrollTimeout = { current: setTimeout(() => undefined, 1000) };
    const wheelZoomTimeout = { current: setTimeout(() => undefined, 1000) };
    const canvas = document.createElement("div");
    canvas.setAttribute("data-viewport-interaction-active", "true");
    testWorkspace.reactFlow.setState({
      domNode: canvas,
      paneDragging: true,
      viewportInteractionActive: true,
    });

    resetViewportInteractionState({
      host: testWorkspace.host,
      isPanScrolling: { current: true },
      isWheelZooming: { current: true },
      isZoomingOrPanning: { current: true },
      panScrollTimeout,
      wheelZoomTimeout,
    });

    expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
      false,
    );
    expect(testWorkspace.reactFlow.getState().paneDragging).toBe(false);
    expect(canvas.hasAttribute("data-viewport-interaction-active")).toBe(false);
  });

  it("keeps a pan-scroll gesture canvas-owned across a nowheel surface for 150 ms", async () => {
    const panScrollingTransitions: boolean[] = [];
    const unsubscribe = subscribeWorkspaceCanvasPanScrolling(
      testWorkspace.host,
      (isPanScrolling) => panScrollingTransitions.push(isPanScrolling),
    );
    const { host, renderer, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const terminal = document.createElement("div");
    terminal.className = "nowheel";
    const terminalWheelListener = vi.fn((event: WheelEvent) => {
      event.stopPropagation();
    });
    terminal.addEventListener("wheel", terminalWheelListener);
    renderer.appendChild(terminal);

    try {
      await act(async () => {
        renderer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: 20,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(testWorkspace.reactFlow.getState().isPanScrolling).toBe(true);
      expect(panScrollingTransitions).toEqual([true]);

      let crossingEvent: WheelEvent | undefined;
      await act(async () => {
        crossingEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: 20,
        });
        terminal.dispatchEvent(crossingEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([
        -10, -10, 1,
      ]);
      expect(crossingEvent?.defaultPrevented).toBe(true);
      expect(terminalWheelListener).not.toHaveBeenCalled();
      expect(panScrollingTransitions).toEqual([true]);

      await act(async () => {
        vi.advanceTimersByTime(149);
      });
      expect(testWorkspace.reactFlow.getState().isPanScrolling).toBe(true);
      expect(panScrollingTransitions).toEqual([true]);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(testWorkspace.reactFlow.getState().isPanScrolling).toBe(false);
      expect(panScrollingTransitions).toEqual([true, false]);

      let terminalEvent: WheelEvent | undefined;
      await act(async () => {
        terminalEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: 20,
        });
        terminal.dispatchEvent(terminalEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([
        -10, -10, 1,
      ]);
      expect(terminalEvent?.defaultPrevented).toBe(false);
      expect(terminalWheelListener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("distinguishes native wheel areas from manually consumed controls", async () => {
    const { host, renderer, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const target = document.createElement("input");
    target.className = "nopan";
    renderer.appendChild(target);

    try {
      await act(async () => {
        target.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: 20,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );
      expect(
        renderer.parentElement?.getAttribute(
          "data-viewport-interaction-active",
        ),
      ).toBe("true");

      target.classList.add("setta-manual-wheel");
      let manualEvent: WheelEvent | undefined;
      await act(async () => {
        manualEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: -20,
        });
        target.dispatchEvent(manualEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(manualEvent?.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );
      target.classList.remove("setta-manual-wheel");

      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        false,
      );
      expect(
        renderer.parentElement?.hasAttribute(
          "data-viewport-interaction-active",
        ),
      ).toBe(false);
      target.classList.add("nowheel");
      let blockedEvent: WheelEvent | undefined;
      await act(async () => {
        blockedEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 20,
        });
        target.dispatchEvent(blockedEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(blockedEvent?.defaultPrevented).toBe(false);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        false,
      );

      let paneEvent: WheelEvent | undefined;
      await act(async () => {
        paneEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 20,
        });
        renderer.dispatchEvent(paneEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-20, 0, 1]);
      expect(paneEvent?.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("pans horizontally over a vertically scrollable item surface", async () => {
    const { host, renderer, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const target = document.createElement("div");
    target.className = "setta-native-wheel-y";
    renderer.appendChild(target);

    try {
      let verticalEvent: WheelEvent | undefined;
      await act(async () => {
        verticalEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: 40,
        });
        target.dispatchEvent(verticalEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([0, 0, 1]);
      expect(verticalEvent?.defaultPrevented).toBe(false);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        false,
      );

      let horizontalEvent: WheelEvent | undefined;
      await act(async () => {
        horizontalEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 40,
        });
        target.dispatchEvent(horizontalEvent);
      });
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-20, 0, 1]);
      expect(horizontalEvent?.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("routes generic floating-window content through the canvas pan handler", async () => {
    const { host, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({});

    try {
      let wheelEvent: WheelEvent | undefined;
      await act(async () => {
        wheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 20,
        });
        target.dispatchEvent(wheelEvent);
      });

      expect(wheelEvent?.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(testWorkspace.reactFlow.getState().isPanScrolling).toBe(true);
    } finally {
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("anchors bridged wheel zoom against the canvas renderer", async () => {
    const { host, renderer, root } = await renderZoomPane();
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({});
    vi.spyOn(renderer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 600, width: 800, x: 100, y: 50 }),
    );

    try {
      let wheelEvent: WheelEvent | undefined;
      await act(async () => {
        wheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 260,
          clientY: 180,
          deltaY: -120,
        });
        target.dispatchEvent(wheelEvent);
      });

      const zoom = Math.pow(2, 0.24);
      const [x, y, scale] = testWorkspace.reactFlow.getState().transform;
      expect(wheelEvent?.defaultPrevented).toBe(true);
      expect(scale).toBeCloseTo(zoom, 8);
      expect(x).toBeCloseTo(160 * (1 - zoom), 8);
      expect(y).toBeCloseTo(130 * (1 - zoom), 8);
    } finally {
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("anchors bridged pinch zoom against the canvas renderer", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh");
    const { host, renderer, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({});
    target.setAttribute("data-workspace-section-window-surface", "true");
    vi.spyOn(renderer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 600, width: 800, x: 100, y: 50 }),
    );

    try {
      let wheelEvent: WheelEvent | undefined;
      await act(async () => {
        wheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 260,
          clientY: 180,
          ctrlKey: true,
          deltaY: -10,
        });
        target.dispatchEvent(wheelEvent);
      });

      const zoom = Math.pow(2, 0.2);
      const [x, y, scale] = testWorkspace.reactFlow.getState().transform;
      expect(wheelEvent?.defaultPrevented).toBe(true);
      expect(scale).toBeCloseTo(zoom, 8);
      expect(x).toBeCloseTo(160 * (1 - zoom), 8);
      expect(y).toBeCloseTo(130 * (1 - zoom), 8);
    } finally {
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("preserves native and manual wheel ownership in a floating window", async () => {
    const { host, root } = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({});
    const defaultsSeenByControl: boolean[] = [];
    target.addEventListener("wheel", (event) => {
      defaultsSeenByControl.push(event.defaultPrevented);
    });

    try {
      target.className = "setta-native-wheel-y";
      let nativeWheelEvent: WheelEvent | undefined;
      await act(async () => {
        nativeWheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 8,
          deltaY: 40,
        });
        target.dispatchEvent(nativeWheelEvent);
      });

      target.className = "nowheel";
      let noWheelEvent: WheelEvent | undefined;
      await act(async () => {
        noWheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 40,
        });
        target.dispatchEvent(noWheelEvent);
      });

      target.className = "setta-manual-wheel";
      let manualWheelEvent: WheelEvent | undefined;
      await act(async () => {
        manualWheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 40,
        });
        target.dispatchEvent(manualWheelEvent);
      });

      target.className = "setta-native-wheel-y";
      let horizontalNativeWheelEvent: WheelEvent | undefined;
      await act(async () => {
        horizontalNativeWheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 40,
        });
        target.dispatchEvent(horizontalNativeWheelEvent);
      });

      expect(nativeWheelEvent?.defaultPrevented).toBe(false);
      expect(noWheelEvent?.defaultPrevented).toBe(false);
      expect(manualWheelEvent?.defaultPrevented).toBe(true);
      expect(horizontalNativeWheelEvent?.defaultPrevented).toBe(true);
      expect(defaultsSeenByControl).toEqual([false, false, true]);
      expect(testWorkspace.reactFlow.getState().transform).toEqual([-20, 0, 1]);
    } finally {
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps activation-key ownership over a floating nowheel target", async () => {
    const { host, root } = await renderZoomPane({
      zoomActivationKeyPressed: true,
    });
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({ targetClassName: "nowheel" });

    try {
      let wheelEvent: WheelEvent | undefined;
      await act(async () => {
        wheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: -120,
        });
        target.dispatchEvent(wheelEvent);
      });

      expect(wheelEvent?.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().transform[2]).toBeGreaterThan(
        1,
      );
    } finally {
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("does not route registered dock or outline sibling chrome", async () => {
    const { host, root } = await renderZoomPane();
    const {
      manager,
      target: dockTarget,
      unregister,
    } = appendWorkspaceWindowManagerWheelTarget({ overlay: false });
    const outline = document.createElement("div");
    const outlineTarget = document.createElement("div");
    outline.setAttribute("data-workspace-outline", "true");
    outline.appendChild(outlineTarget);
    document.body.appendChild(outline);
    const unregisterOutline = registerWorkspaceHostElement(
      testWorkspace.host,
      outline,
    );

    try {
      const dockEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
      });
      const outlineEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
      });
      await act(async () => {
        dockTarget.dispatchEvent(dockEvent);
        outlineTarget.dispatchEvent(outlineEvent);
      });

      expect(dockEvent.defaultPrevented).toBe(false);
      expect(outlineEvent.defaultPrevented).toBe(false);
      expect(testWorkspace.reactFlow.getState().transform).toEqual([0, 0, 1]);
    } finally {
      unregisterOutline();
      outline.remove();
      unregister();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("does not route a second workspace host's floating window", async () => {
    const { host, root } = await renderZoomPane();
    const otherWorkspace = createWorkspaceTestHost();
    const { manager, target, unregister } =
      appendWorkspaceWindowManagerWheelTarget({ host: otherWorkspace.host });

    try {
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
      });
      await act(async () => {
        target.dispatchEvent(wheelEvent);
      });

      expect(wheelEvent.defaultPrevented).toBe(false);
      expect(testWorkspace.reactFlow.getState().transform).toEqual([0, 0, 1]);
    } finally {
      unregister();
      otherWorkspace.host.dispose();
      manager.remove();
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps live workspace bridges isolated and removes an unmounted bridge", async () => {
    const otherWorkspace = createWorkspaceTestHost();
    otherWorkspace.nodeInternals.getState().reset();
    otherWorkspace.document.getState().reset();
    otherWorkspace.document.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    otherWorkspace.options.getState().reset();
    otherWorkspace.reactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });
    const firstPane = await renderZoomPane({
      panOnScroll: true,
      zoomOnScroll: false,
    });
    const secondPane = await renderZoomPane(
      {
        panOnScroll: true,
        zoomOnScroll: false,
      },
      otherWorkspace,
    );
    const firstWindow = appendWorkspaceWindowManagerWheelTarget({});
    const secondWindow = appendWorkspaceWindowManagerWheelTarget({
      host: otherWorkspace.host,
    });
    let firstPaneUnmounted = false;

    try {
      const secondWheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 20,
      });
      await act(async () => {
        secondWindow.target.dispatchEvent(secondWheelEvent);
      });

      expect(secondWheelEvent.defaultPrevented).toBe(true);
      expect(testWorkspace.reactFlow.getState().transform).toEqual([0, 0, 1]);
      expect(otherWorkspace.reactFlow.getState().transform).toEqual([
        -10, 0, 1,
      ]);

      await act(async () => {
        firstPane.root.unmount();
      });
      firstPaneUnmounted = true;
      firstPane.host.remove();

      const staleTargetWheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 20,
      });
      await act(async () => {
        firstWindow.target.dispatchEvent(staleTargetWheelEvent);
      });

      expect(staleTargetWheelEvent.defaultPrevented).toBe(false);
      expect(otherWorkspace.reactFlow.getState().transform).toEqual([
        -10, 0, 1,
      ]);
    } finally {
      firstWindow.unregister();
      firstWindow.manager.remove();
      secondWindow.unregister();
      secondWindow.manager.remove();
      if (!firstPaneUnmounted) {
        await act(async () => {
          firstPane.root.unmount();
        });
        firstPane.host.remove();
      }
      await act(async () => {
        secondPane.root.unmount();
      });
      secondPane.host.remove();
      otherWorkspace.host.dispose();
    }
  });

  it("keeps wheel-burst interaction active until the burst timeout settles after drag end", async () => {
    const { host, renderer, root } = await renderZoomPane();

    try {
      const d3Zoom = testWorkspace.reactFlow.getState().d3Zoom;
      if (!d3Zoom) {
        throw new Error("Expected ZoomPane to initialize d3 zoom state.");
      }

      const startHandler = d3Zoom.on("start");
      const endHandler = d3Zoom.on("end");
      if (
        typeof startHandler !== "function" ||
        typeof endHandler !== "function"
      ) {
        throw new Error(
          "Expected ZoomPane to register drag lifecycle handlers.",
        );
      }

      await act(async () => {
        startHandler.call(
          renderer,
          {
            sourceEvent: new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
            }),
          },
          undefined,
        );
      });

      expect(testWorkspace.reactFlow.getState().paneDragging).toBe(true);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );

      await act(async () => {
        renderer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
            clientX: 240,
            clientY: 180,
          }),
        );
      });

      await act(async () => {
        endHandler.call(
          renderer,
          {
            sourceEvent: new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: true,
            }),
          },
          undefined,
        );
      });

      expect(testWorkspace.reactFlow.getState().paneDragging).toBe(false);
      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );

      await act(async () => {
        vi.advanceTimersByTime(179);
      });

      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        true,
      );

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(testWorkspace.reactFlow.getState().viewportInteractionActive).toBe(
        false,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("completes a pending initial fit after the zoom pane initializes d3 state", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [
          "settings-core-node",
          {
            id: "settings-core-node",
            position: { x: 240, y: 180 },
            width: 220,
            height: 140,
            zIndex: 0,
            tempZIndex: 0,
            kind: "leaf",
          },
        ],
      ]),
    });

    testWorkspace.document.setState({ viewport: null });
    testWorkspace.reactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });

    const { host, root } = await renderZoomPane();

    try {
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
      expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);
      expect(testWorkspace.reactFlow.getState().transform).not.toEqual([
        0, 0, 1,
      ]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("retries a pending initial fit when a document load marks fitViewOnInit after d3 is ready", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [
          "settings-core-node",
          {
            id: "settings-core-node",
            position: { x: 240, y: 180 },
            width: 220,
            height: 140,
            zIndex: 0,
            tempZIndex: 0,
            kind: "leaf",
          },
        ],
      ]),
    });

    const { host, root } = await renderZoomPane();

    try {
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
      expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);

      await act(async () => {
        testWorkspace.reactFlow.setState({
          fitViewOnInit: true,
          fitViewOnInitDone: false,
          fitViewOnInitOptions: { nodes: [{ id: "settings-core-node" }] },
        });
      });

      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
      expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);
      expect(testWorkspace.reactFlow.getState().transform).not.toEqual([
        0, 0, 1,
      ]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("clears the d3 handles on unmount so a load no longer sees a mounted canvas", async () => {
    const { host, root } = await renderZoomPane();

    expect(testWorkspace.reactFlow.getState().d3Zoom).not.toBeNull();
    expect(testWorkspace.reactFlow.getState().d3Selection).not.toBeNull();
    expect(testWorkspace.reactFlow.getState().domNode).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();

    expect(testWorkspace.reactFlow.getState().d3Zoom).toBeNull();
    expect(testWorkspace.reactFlow.getState().d3Selection).toBeNull();
    expect(testWorkspace.reactFlow.getState().domNode).toBeNull();
  });
});
