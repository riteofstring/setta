/* @vitest-environment jsdom */

import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMisc, useNodeInternals, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import * as utils from "utils/utils";
import { PanOnScrollModeEnum, createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initialState from "../store/initialState";
import ZoomPane, {
  getViewportInteractionActiveValue,
  resetViewportInteractionState,
  resolvePanOnScrollDelta,
  shouldAllowZoomFilterEvent,
} from "./ZoomPane";

type RenderedZoomPane = {
  host: HTMLDivElement;
  renderer: HTMLDivElement;
  root: Root;
};

async function renderZoomPane(): Promise<RenderedZoomPane> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        "div",
        { className: "react-flow" },
        createElement(
          ZoomPane,
          { wrapperDimensions: { width: 800, height: 600 } },
          createElement("div"),
        ),
      ),
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
        panOnScrollMode: PanOnScrollModeEnum.free,
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
        panOnScrollMode: PanOnScrollModeEnum.vertical,
      }),
    ).toEqual({
      deltaX: 0,
      deltaY: 4,
    });
    expect(
      resolvePanOnScrollDelta({
        event,
        isMacOS: true,
        panOnScrollMode: PanOnScrollModeEnum.horizontal,
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
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });

  it("allows ctrl-wheel pinch zoom on nowheel targets when mac pinch zoom is enabled", () => {
    const isMacOsMock = vi.spyOn(utils, "isMacOs").mockReturnValue(true);
    const target = appendTargetWithClass("nowheel");
    const event = withEventTarget(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -120,
      }),
      target,
    );

    expect(
      shouldAllowZoomFilterEvent({
        event,
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: false,
      }),
    ).toBe(true);

    isMacOsMock.mockRestore();
  });

  it("blocks viewport gestures while drag sorting is active", () => {
    useDndState.setState({
      isSorting: true,
      isMovingFree: false,
    });

    expect(
      shouldAllowZoomFilterEvent({
        event: new MouseEvent("mousedown", { button: 0 }),
        panOnDrag: true,
        panOnScroll: false,
        userSelectionActive: false,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toBe(false);
  });
});

describe("getViewportInteractionActiveValue", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useMisc.setState({ isPanScrolling: false });
    useReactFlow.setState({
      ...initialState,
      width: 800,
      height: 600,
      paneDragging: false,
      viewportInteractionActive: false,
    });
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("stays active while drag-pan is still running after pan-scroll settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("stays active while drag-pan is still running after a wheel-zoom burst settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("turns inactive only after every gesture source is idle", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: false,
      }),
    ).toBe(false);
  });

  it("clears global gesture flags during teardown", () => {
    const panScrollTimeout = { current: setTimeout(() => undefined, 1000) };
    const wheelZoomTimeout = { current: setTimeout(() => undefined, 1000) };
    useMisc.setState({ isPanScrolling: true });
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

    expect(useMisc.getState().isPanScrolling).toBe(false);
    expect(useReactFlow.getState().viewportInteractionActive).toBe(false);
    expect(useReactFlow.getState().paneDragging).toBe(false);
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
      if (
        typeof startHandler !== "function" ||
        typeof endHandler !== "function"
      ) {
        throw new Error(
          "Expected ZoomPane to register drag lifecycle handlers.",
        );
      }

      await act(async () => {
        startHandler({
          sourceEvent: new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
          }),
        });
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
        endHandler({
          sourceEvent: new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
          }),
        });
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

  it("applies default wheel zoom immediately without queuing a transform frame", async () => {
    const queuedFrames: Array<{
      callback: FrameRequestCallback;
      id: number;
    }> = [];
    let nextFrameId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        queuedFrames.push({ callback, id });
        return id;
      },
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
      const frameIndex = queuedFrames.findIndex((frame) => frame.id === frameId);
      if (frameIndex >= 0) {
        queuedFrames.splice(frameIndex, 1);
      }
    });

    const { host, renderer, root } = await renderZoomPane();
    queuedFrames.splice(0);

    try {
      expect(useReactFlow.getState().transform).toEqual([0, 0, 1]);

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

      expect(useReactFlow.getState().transform[2]).toBeGreaterThan(1);
      expect(useReactFlow.getState().viewportInteractionActive).toBe(true);
      expect(queuedFrames).toHaveLength(0);
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
          },
        ],
      ]),
    });
    useReactFlow.setState({
      ...initialState,
      width: 800,
      height: 600,
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: { nodes: [{ id: "settings-core-node" }] },
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

  it("retries a pending initial fit when project load marks fitViewOnInit after d3 is ready", async () => {
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
          },
        ],
      ]),
    });

    const { host, root } = await renderZoomPane();

    try {
      expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);

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

  it("coalesces interaction-driven zoom transforms until the next animation frame", async () => {
    const queuedFrames: Array<{
      callback: FrameRequestCallback;
      id: number;
    }> = [];
    let nextFrameId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        queuedFrames.push({ callback, id });
        return id;
      },
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
      const frameIndex = queuedFrames.findIndex((frame) => frame.id === frameId);
      if (frameIndex >= 0) {
        queuedFrames.splice(frameIndex, 1);
      }
    });

    const { host, root } = await renderZoomPane();

    try {
      const d3Zoom = useReactFlow.getState().d3Zoom;
      if (!d3Zoom) {
        throw new Error("Expected ZoomPane to initialize d3 zoom state.");
      }

      const zoomHandler = d3Zoom.on("zoom");
      if (typeof zoomHandler !== "function") {
        throw new Error("Expected ZoomPane to register a zoom handler.");
      }

      await act(async () => {
        zoomHandler({
          sourceEvent: new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
          }),
          transform: { x: 10, y: 20, k: 1.2 },
        });
        zoomHandler({
          sourceEvent: new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -80,
          }),
          transform: { x: 30, y: 40, k: 1.4 },
        });
      });

      expect(useReactFlow.getState().transform).toEqual([0, 0, 1]);
      expect(queuedFrames).toHaveLength(1);

      await act(async () => {
        const nextFrame = queuedFrames.shift();
        if (!nextFrame) {
          throw new Error("Expected one queued animation frame.");
        }
        nextFrame.callback(16);
      });

      expect(useReactFlow.getState().transform).toEqual([30, 40, 1.4]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("flushes a queued wheel transform synchronously when the gesture ends", async () => {
    const queuedFrames: Array<{
      callback: FrameRequestCallback;
      id: number;
    }> = [];
    let nextFrameId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        queuedFrames.push({ callback, id });
        return id;
      },
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
      const frameIndex = queuedFrames.findIndex((frame) => frame.id === frameId);
      if (frameIndex >= 0) {
        queuedFrames.splice(frameIndex, 1);
      }
    });

    const { host, root } = await renderZoomPane();

    try {
      const d3Zoom = useReactFlow.getState().d3Zoom;
      if (!d3Zoom) {
        throw new Error("Expected ZoomPane to initialize d3 zoom state.");
      }

      const zoomHandler = d3Zoom.on("zoom");
      const endHandler = d3Zoom.on("end");
      if (
        typeof zoomHandler !== "function" ||
        typeof endHandler !== "function"
      ) {
        throw new Error(
          "Expected ZoomPane to register zoom lifecycle handlers.",
        );
      }

      const endEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
      });

      await act(async () => {
        zoomHandler({
          sourceEvent: endEvent,
          transform: { x: 15, y: 25, k: 1.3 },
        });
      });

      expect(useReactFlow.getState().transform).toEqual([0, 0, 1]);
      expect(queuedFrames).toHaveLength(1);

      await act(async () => {
        endHandler({
          sourceEvent: endEvent,
          transform: { x: 15, y: 25, k: 1.3 },
        });
      });

      expect(useReactFlow.getState().transform).toEqual([15, 25, 1.3]);
      expect(queuedFrames).toHaveLength(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
