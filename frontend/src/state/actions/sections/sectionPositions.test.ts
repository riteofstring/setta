/* @vitest-environment jsdom */

import { gpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { cancelViewportTransition } from "gpuFlow/viewportActions";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useLocalStorage, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goToSection } from "./sectionPositions";

vi.mock("../activeSectionController", () => ({
  applyActiveSectionChange: vi.fn(),
}));

describe("goToSection", () => {
  beforeEach(() => {
    resetProjectStores();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
    useSettings.setState(createSettingsState(), true);
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        transitionDuration: 80,
      },
    }));
    useLocalStorage.setState({
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    });
  });

  afterEach(() => {
    cancelViewportTransition();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    resetProjectStores();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
    useSettings.setState(createSettingsState(), true);
  });

  it("uses the GPU viewport transition duration from settings", () => {
    const animation = installAnimationFrameController();
    const pane = createElementWithRect({
      height: 800,
      width: 1000,
      x: 0,
      y: 0,
    });
    gpuFlowViewportStore.getState().setDomNode(pane);
    gpuFlowLayoutStore.getState().replaceNodes([
      {
        height: 120,
        nodeId: "section-a",
        tempZIndex: 0,
        width: 200,
        x: 700,
        y: 500,
        zIndex: 0,
      },
    ]);

    goToSection("section-a");

    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(true);
    expect(gpuFlowViewportStore.getState().viewportInteractionActive).toBe(
      true,
    );
    expect(gpuFlowViewportStore.getState().transform).toEqual([0, 0, 1]);

    animation.flushNextFrame(0);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(true);

    animation.flushNextFrame(80);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(false);
    expect(gpuFlowViewportStore.getState().viewportInteractionActive).toBe(
      false,
    );
    expect(gpuFlowViewportStore.getState().transform).not.toEqual([0, 0, 1]);
  });
});

function resetGpuViewport() {
  const state = gpuFlowViewportStore.getState();
  state.setDomNode(null);
  state.setTransform([0, 0, 1]);
  state.setViewportSize({ height: 800, width: 1000 });
  state.setZoomBounds({ defaultZoom: 1, maxZoom: 4, minZoom: 0.1 });
  state.setViewportInteractionFlags({
    nodeDragging: false,
    nodeResizing: false,
    paneDragging: false,
    panScrolling: false,
    pointerPanning: false,
    viewportAnimating: false,
    wheelZooming: false,
  });
}

function createElementWithRect(rect: {
  height: number;
  width: number;
  x: number;
  y: number;
}) {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => rect.height,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => rect.width,
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.y + rect.height,
      height: rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y,
      toJSON: () => "",
    }) as DOMRect;
  return element;
}

function installAnimationFrameController() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
    callbacks.delete(frameId);
  });
  return {
    flushNextFrame(timestampMs: number) {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("No animation frame is pending.");
      }
      callbacks.delete(frameId);
      callback(timestampMs);
    },
  };
}
