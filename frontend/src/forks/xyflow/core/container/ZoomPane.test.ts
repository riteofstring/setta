/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMisc, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initialState from "../store/initialState";
import ZoomPane, { resetViewportInteractionState } from "./ZoomPane";

type RenderedZoomPane = {
  host: HTMLDivElement;
  renderer: HTMLDivElement;
  root: Root;
};

async function renderZoomPane(
  props: Partial<ComponentProps<typeof ZoomPane>> = {},
): Promise<RenderedZoomPane> {
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
          {
            wrapperDimensions: { width: 800, height: 600 },
            ...props,
          },
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

describe("ZoomPane", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useMisc.setState({ isPanScrolling: false });
    useReactFlow.setState({
      ...initialState,
      width: 800,
      height: 600,
      paneDragging: false,
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

  it("clears pan-scroll and drag flags during teardown", () => {
    const panScrollTimeout = { current: setTimeout(() => undefined, 1000) };
    useMisc.setState({ isPanScrolling: true });
    useReactFlow.setState({ paneDragging: true });

    resetViewportInteractionState({
      isPanScrolling: { current: true },
      isZoomingOrPanning: { current: true },
      panScrollTimeout,
    });

    expect(useMisc.getState().isPanScrolling).toBe(false);
    expect(useReactFlow.getState().paneDragging).toBe(false);
  });

  it("toggles paneDragging for drag-pan lifecycle", async () => {
    const { host, root } = await renderZoomPane();

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

      await act(async () => {
        endHandler({
          sourceEvent: new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
          }),
        });
      });

      expect(useReactFlow.getState().paneDragging).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("clears pan-on-scroll state after the settle timeout", async () => {
    const { host, renderer, root } = await renderZoomPane({
      panOnScroll: true,
    });

    try {
      await act(async () => {
        renderer.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: 0,
            deltaY: 120,
            clientX: 240,
            clientY: 180,
          }),
        );
      });

      expect(useMisc.getState().isPanScrolling).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(149);
      });

      expect(useMisc.getState().isPanScrolling).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(useMisc.getState().isPanScrolling).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
