/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import ZoomPane, {
  getViewportInteractionActiveValue,
  resetViewportInteractionState,
  resolvePanOnScrollDelta,
  shouldAllowZoomFilterEvent,
} from "./ZoomPane";

// Ported from the reference fork's `container/ZoomPane.test.ts`. The drag-sorting filter case
// returns with the dnd-kit batch that owns the drag-session store.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
): Promise<RenderedZoomPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <div className="react-flow">
        <ZoomPane {...zoomPaneOptions} {...overrides}>
          <div />
        </ZoomPane>
      </div>,
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
    const event = withEventTarget(new MouseEvent("mousedown", { button: 1 }), node);

    expect(
      shouldAllowZoomFilterEvent({
        event,
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
    const event = withEventTarget(new WheelEvent("wheel", { deltaY: -120 }), target);

    expect(
      shouldAllowZoomFilterEvent({
        event,
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
    const event = withEventTarget(new WheelEvent("wheel", { deltaY: -120 }), target);

    expect(
      shouldAllowZoomFilterEvent({
        event,
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });

  it("blocks pointer starts while the marquee selection is active", () => {
    expect(
      shouldAllowZoomFilterEvent({
        event: new MouseEvent("mousedown", { button: 0 }),
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
    useNodeInternals.getState().reset();
    useWorkspaceDocument.getState().reset();
    // A saved camera, so mounting the zoom pane does not arm the fit-on-init path on its own.
    useWorkspaceDocument.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    useNodeInternals.getState().reset();
    useWorkspaceDocument.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
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
    useReactFlow.setState({
      paneDragging: true,
      viewportInteractionActive: true,
    });

    resetViewportInteractionState({
      isPanScrolling: { current: true },
      isWheelZooming: { current: true },
      isZoomingOrPanning: { current: true },
      panScrollTimeout,
      wheelZoomTimeout,
    });

    expect(useReactFlow.getState().viewportInteractionActive).toBe(false);
    expect(useReactFlow.getState().paneDragging).toBe(false);
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
      expect(useReactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);

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
      expect(useReactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(manualEvent?.defaultPrevented).toBe(true);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);
      target.classList.remove("setta-manual-wheel");

      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      expect(useReactFlow.getState().viewportInteractionActive).toBe(false);
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
      expect(useReactFlow.getState().transform).toEqual([-10, 0, 1]);
      expect(blockedEvent?.defaultPrevented).toBe(false);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(false);

      let paneEvent: WheelEvent | undefined;
      await act(async () => {
        paneEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 20,
        });
        renderer.dispatchEvent(paneEvent);
      });
      expect(useReactFlow.getState().transform).toEqual([-20, 0, 1]);
      expect(paneEvent?.defaultPrevented).toBe(true);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps wheel-burst interaction active until the burst timeout settles after drag end", async () => {
    const { host, renderer, root } = await renderZoomPane();

    try {
      const d3Zoom = useReactFlow.getState().d3Zoom;
      if (!d3Zoom) {
        throw new Error("Expected ZoomPane to initialize d3 zoom state.");
      }

      const startHandler = d3Zoom.on("start");
      const endHandler = d3Zoom.on("end");
      if (typeof startHandler !== "function" || typeof endHandler !== "function") {
        throw new Error("Expected ZoomPane to register drag lifecycle handlers.");
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

      expect(useReactFlow.getState().paneDragging).toBe(true);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);

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

      // Drag teardown should not clear the active wheel burst prematurely.
      expect(useReactFlow.getState().paneDragging).toBe(false);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(179);
      });

      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(useReactFlow.getState().viewportInteractionActive).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("completes a pending initial fit after the zoom pane initializes d3 state", async () => {
    useNodeInternals.setState({
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
    // A document without a saved camera arms fit-on-init through the mount-time
    // `getInitialCanvasViewport`; the initialization effect then completes the fit.
    useWorkspaceDocument.setState({ viewport: null });
    useReactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });

    const { host, root } = await renderZoomPane();

    try {
      expect(useReactFlow.getState().fitViewOnInit).toBe(false);
      expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
      expect(useReactFlow.getState().transform).not.toEqual([0, 0, 1]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("retries a pending initial fit when a document load marks fitViewOnInit after d3 is ready", async () => {
    useNodeInternals.setState({
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
      // Mounting with the saved camera normalizes the fit flags instead of arming.
      expect(useReactFlow.getState().fitViewOnInit).toBe(false);
      expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);

      // The shape of a mounted re-load without a saved camera: `armLoadedDocumentFitView`
      // arms while d3 is already initialized, and the initialization effect retries.
      await act(async () => {
        useReactFlow.setState({
          fitViewOnInit: true,
          fitViewOnInitDone: false,
          fitViewOnInitOptions: { nodes: [{ id: "settings-core-node" }] },
        });
      });

      expect(useReactFlow.getState().fitViewOnInit).toBe(false);
      expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
      expect(useReactFlow.getState().transform).not.toEqual([0, 0, 1]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("clears the d3 handles on unmount so a load no longer sees a mounted canvas", async () => {
    const { host, root } = await renderZoomPane();

    expect(useReactFlow.getState().d3Zoom).not.toBeNull();
    expect(useReactFlow.getState().d3Selection).not.toBeNull();
    expect(useReactFlow.getState().domNode).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();

    expect(useReactFlow.getState().d3Zoom).toBeNull();
    expect(useReactFlow.getState().d3Selection).toBeNull();
    expect(useReactFlow.getState().domNode).toBeNull();
  });
});
