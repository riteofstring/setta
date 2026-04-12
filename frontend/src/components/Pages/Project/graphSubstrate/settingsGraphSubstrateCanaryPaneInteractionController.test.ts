/* @vitest-environment jsdom */

import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSettingsGraphSubstrateCanaryPaneInteractionController,
  WHEEL_ZOOM_IDLE_TIMEOUT_MS,
} from "./settingsGraphSubstrateCanaryPaneInteractionController";
import type { GraphViewport } from "./viewportTransform";

function createViewportHarness(
  behaviorOverrides: Partial<ReturnType<typeof createWheelBehavior>> = {},
) {
  let resolvedViewport: GraphViewport | null = {
    x: 10,
    y: 20,
    zoom: 1.5,
  };
  let latestBuilder:
    | ((currentViewport: GraphViewport) => GraphViewport | null)
    | null = null;
  const applyControlledViewportChange = vi.fn(
    (builder: (currentViewport: GraphViewport) => GraphViewport | null) => {
      latestBuilder = builder;
    },
  );
  const commitLocalViewport = vi.fn((nextViewport: GraphViewport) => {
    resolvedViewport = nextViewport;
  });
  const onViewportPanningChange = vi.fn();
  const syncViewportInteractionState = vi.fn();
  const wheelBehavior = createWheelBehavior(behaviorOverrides);
  const controller =
    createSettingsGraphSubstrateCanaryPaneInteractionController({
      applyControlledViewportChange,
      commitLocalViewport,
      getResolvedViewport: () => resolvedViewport,
      getRootBounds: () => ({ left: 100, top: 50 }),
      getWheelBehavior: () => wheelBehavior,
      onViewportPanningChange,
      syncViewportInteractionState,
    });

  return {
    applyControlledViewportChange,
    commitLocalViewport,
    controller,
    onViewportPanningChange,
    resolveNextViewport(currentViewport: GraphViewport) {
      if (!latestBuilder) {
        throw new Error("Expected applyControlledViewportChange to be called.");
      }
      return latestBuilder(currentViewport);
    },
    syncViewportInteractionState,
  };
}

function createWheelBehavior(
  overrides: Partial<{
    isMacOs: boolean;
    maxZoom: number;
    minZoom: number;
    panOnScroll: boolean;
    panOnScrollMode: PanOnScrollModeEnum;
    panOnScrollSpeed: number;
    zoomActivationKeyPressed: boolean;
    zoomOnPinch: boolean;
    zoomOnScroll: boolean;
  }> = {},
) {
  return {
    isMacOs: true,
    maxZoom: 4,
    minZoom: 0.1,
    panOnScroll: true,
    panOnScrollMode: PanOnScrollModeEnum.free,
    panOnScrollSpeed: 1,
    zoomActivationKeyPressed: false,
    zoomOnPinch: true,
    zoomOnScroll: true,
    ...overrides,
  };
}

describe("settingsGraphSubstrateCanaryPaneInteractionController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes pane pointer drags through one controller-owned pan session", () => {
    const harness = createViewportHarness();

    expect(
      harness.controller.handlePanePointerDown({
        button: 0,
        clientX: 300,
        clientY: 200,
        pointerId: 7,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.onViewportPanningChange).toHaveBeenCalledWith(true);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: true,
      isWheelZooming: false,
    });

    expect(
      harness.controller.handlePanePointerMove({
        clientX: 330,
        clientY: 240,
        pointerId: 7,
      }),
    ).toBe(true);
    expect(harness.commitLocalViewport).toHaveBeenCalledWith({
      x: 40,
      y: 60,
      zoom: 1.5,
    });

    expect(harness.controller.finishPanePan({ pointerId: 7 })).toBe(true);
    expect(harness.onViewportPanningChange).toHaveBeenLastCalledWith(false);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: false,
    });
  });

  it("keeps pan-scroll interaction state alive until the idle timeout expires", () => {
    const harness = createViewportHarness();

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 12,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(1);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: true,
      isViewportPanning: false,
      isWheelZooming: false,
    });

    vi.advanceTimersByTime(149);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: false,
    });
  });

  it("does not resync pan-scroll interaction state while repeated wheel events keep the same mode active", () => {
    const harness = createViewportHarness();

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 12,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(75);

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 12,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(2);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(149);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(2);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: false,
    });
  });

  it("keeps wheel-zoom interaction state alive until the idle timeout expires", () => {
    const harness = createViewportHarness({
      zoomActivationKeyPressed: true,
    });

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -60,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(1);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: true,
    });
    expect(
      harness.resolveNextViewport({
        x: 10,
        y: 20,
        zoom: 1.5,
      }),
    ).not.toEqual({
      x: 10,
      y: 20,
      zoom: 1.5,
    });

    vi.advanceTimersByTime(WHEEL_ZOOM_IDLE_TIMEOUT_MS);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: false,
    });
  });

  it("does not resync wheel-zoom interaction state while repeated modified wheel events keep the same mode active", () => {
    const harness = createViewportHarness({
      zoomActivationKeyPressed: true,
    });

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -60,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(90);

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -60,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(2);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(WHEEL_ZOOM_IDLE_TIMEOUT_MS - 1);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(2);
    expect(harness.syncViewportInteractionState).toHaveBeenLastCalledWith({
      isPanScrolling: false,
      isViewportPanning: false,
      isWheelZooming: false,
    });
  });

  it("cancels pending idle resets during cleanup", () => {
    const harness = createViewportHarness();

    expect(
      harness.controller.handlePaneWheel({
        clientX: 240,
        clientY: 190,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 12,
        shiftKey: false,
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);

    harness.controller.cleanup();
    vi.runAllTimers();

    expect(harness.syncViewportInteractionState).toHaveBeenCalledTimes(1);
  });
});
