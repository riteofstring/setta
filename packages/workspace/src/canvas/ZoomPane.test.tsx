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
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import ZoomPane, {
  getViewportInteractionActiveValue,
  isNativeVerticalWheelEvent,
  resetViewportInteractionState,
  resolvePanOnScrollDelta,
  shouldAllowZoomFilterEvent,
} from "./ZoomPane";

// Ported from the reference fork's `container/ZoomPane.test.ts`. The drag-sorting filter case
// returns with the dnd-kit batch that owns the drag-session store.

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
): Promise<RenderedZoomPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WorkspaceTestProvider workspace={testWorkspace}>
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
    // A saved camera, so mounting the zoom pane does not arm the fit-on-init path on its own.
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

      // Drag teardown should not clear the active wheel burst prematurely.
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
    // A document without a saved camera arms fit-on-init through the mount-time
    // `getInitialCanvasViewport`; the initialization effect then completes the fit.
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
      // Mounting with the saved camera normalizes the fit flags instead of arming.
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
      expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);

      // The shape of a mounted re-load without a saved camera: `armLoadedDocumentFitView`
      // arms while d3 is already initialized, and the initialization effect retries.
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
