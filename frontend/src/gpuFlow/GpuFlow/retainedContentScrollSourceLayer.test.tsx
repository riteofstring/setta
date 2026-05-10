/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlowRetainedScrollSourceLayer } from "./retainedContentScrollSourceLayer";

let root: Root | null = null;

describe("GpuFlow retained native scroll source layer", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("commits browser scrollTop as retained runtime state without preventing wheel", () => {
    const requestFrame = vi.fn();
    const onScrollOffsetsCommit = vi.fn();
    const runtimeState = createGpuRetainedContentRuntimeState();
    const viewportStore = createGpuFlowViewportStore();
    const viewportRuntime = createGpuFlowViewportRuntime({
      requestFrame,
      store: viewportStore,
    });

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <GpuFlowRetainedScrollSourceLayer
          onScrollOffsetsCommit={onScrollOffsetsCommit}
          requestFrame={() => requestFrame("viewport")}
          runtimeState={runtimeState}
          scene={retainedScrollSourceScene()}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    const source = document.querySelector<HTMLElement>(
      '[data-gpu-flow-retained-scroll-source-id="surface-a"]',
    );
    if (!source) {
      throw new Error("Expected retained native scroll source.");
    }

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 56,
    });
    source.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);

    act(() => {
      source.scrollTop = 56;
      source.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(runtimeState.scrollOffsets.get("surface-a")).toEqual({
      x: 0,
      y: 56,
    });
    expect(onScrollOffsetsCommit).toHaveBeenCalledWith(
      expect.any(Map),
      expect.objectContaining({
        changed: true,
        surfaceId: "surface-a",
      }),
    );
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    viewportRuntime.destroy();
  });
});

function retainedScrollSourceScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedScrollSourceSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedScrollSourceSurface(): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "surface-a",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        controlKind: null,
        depth: 0,
        id: `row-${index}`,
        label: `Row ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: rect,
    }),
    zIndex: 1,
  };
}
