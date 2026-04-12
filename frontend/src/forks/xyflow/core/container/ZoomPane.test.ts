/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import {
  act,
  createElement,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMisc, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initialState from "../store/initialState";
import ZoomPane, {
  getSelectionAwarePanOnDrag,
  getViewportInteractionActiveValue,
  resetViewportInteractionState,
  shouldPreventNoPanInteraction,
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

  it("disables drag panning whenever the selection key is active", () => {
    expect(getSelectionAwarePanOnDrag(true, true)).toBe(false);
    expect(getSelectionAwarePanOnDrag([0, 2], true)).toBe(false);
    expect(getSelectionAwarePanOnDrag([0, 2], false)).toEqual([0, 2]);
  });

  it("lets pan activation bypass nopan only for drag-pan starts", () => {
    expect(
      shouldPreventNoPanInteraction({
        eventType: "mousedown",
        panOnScroll: false,
        wrappedWithNoPan: true,
        panActivationKeyPressed: true,
      }),
    ).toBe(false);

    expect(
      shouldPreventNoPanInteraction({
        eventType: "wheel",
        panOnScroll: true,
        wrappedWithNoPan: true,
        panActivationKeyPressed: true,
      }),
    ).toBe(true);

    expect(
      shouldPreventNoPanInteraction({
        eventType: "mousedown",
        panOnScroll: false,
        wrappedWithNoPan: true,
        panActivationKeyPressed: false,
      }),
    ).toBe(true);
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

  it("does not rerender when selection key state changes without a selection drag", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(
          "div",
          { className: "react-flow" },
          createElement(
            Profiler,
            { id: "zoom-pane-profiler", onRender },
            createElement(
              ZoomPane,
              { wrapperDimensions: { width: 800, height: 600 } },
              createElement("div"),
            ),
          ),
        ),
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useReactFlow.setState({ selectionKeyPressed: true });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("switches wheel handling to zoom when the zoom activation key turns on after mount", async () => {
    const { host, renderer, root } = await renderZoomPane();

    try {
      await act(async () => {
        root.render(
          createElement(
            "div",
            { className: "react-flow" },
            createElement(
              ZoomPane,
              {
                wrapperDimensions: { width: 800, height: 600 },
                panOnScroll: true,
                zoomOnScroll: false,
              },
              createElement("div"),
            ),
          ),
        );
      });

      await act(async () => {
        renderer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: 120,
            clientX: 240,
            clientY: 180,
          }),
        );
      });

      const transformAfterPan = useReactFlow.getState().transform;
      expect(transformAfterPan[2]).toBe(1);
      expect(transformAfterPan[1]).not.toBe(0);

      await act(async () => {
        useReactFlow.setState({ zoomActivationKeyPressed: true });
      });

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
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
