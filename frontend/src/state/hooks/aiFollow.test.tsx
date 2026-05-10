/* @vitest-environment jsdom */

import { gpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { cancelViewportTransition } from "gpuFlow/viewportActions";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useAIFollow,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAIFollowViewport } from "./aiFollow";

describe("useAIFollowViewport", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
    useLocalStorage.setState({
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-alpha",
      });
    });
    gpuFlowLayoutStore.getState().replaceNodes([
      {
        height: 120,
        nodeId: "section-a",
        tempZIndex: 0,
        width: 200,
        x: 900,
        y: 600,
        zIndex: 0,
      },
    ]);
    useAIFollow.setState((state) => {
      state.mode = "all";
      state.toolArgumentsIdsByProjectConfigId = {
        "project-alpha": {
          "chat-alpha": {
            section: ["section-a"],
          },
        },
      };
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    cancelViewportTransition();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    resetProjectStores();
    gpuFlowLayoutStore.getState().replaceNodes([], { reason: "load" });
    resetGpuViewport();
  });

  it("keeps the AI follow transition lock until the GPU viewport animation settles", async () => {
    const animation = installAnimationFrameController();

    await renderHarness();

    expect(useAIFollow.getState().isFollowTransitioning).toBe(true);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(true);

    act(() => {
      animation.flushNextFrame(0);
    });
    expect(useAIFollow.getState().isFollowTransitioning).toBe(true);

    act(() => {
      animation.flushNextFrame(500);
    });
    expect(useAIFollow.getState().isFollowTransitioning).toBe(false);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(false);
  });

  it("clears the AI follow transition lock when user interaction cancels the GPU viewport animation", async () => {
    installAnimationFrameController();

    await renderHarness();

    expect(useAIFollow.getState().isFollowTransitioning).toBe(true);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(true);

    act(() => {
      gpuFlowViewportStore
        .getState()
        .setViewportInteractionFlags({ pointerPanning: true });
    });

    expect(useAIFollow.getState().isFollowTransitioning).toBe(false);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(false);
  });

  async function renderHarness() {
    await act(async () => {
      root.render(<AIFollowViewportHarness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }
});

function AIFollowViewportHarness() {
  useAIFollowViewport();
  return null;
}

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
