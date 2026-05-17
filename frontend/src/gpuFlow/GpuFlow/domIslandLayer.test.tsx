/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import type { GpuViewportInput, GpuViewportTuple } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlowDomIslandLayer } from "./domIslandLayer";

let root: Root | null = null;

describe("GPU Flow DOM island layer", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("tracks committed-frame store updates when React semantic rendering dedupes", () => {
    const firstRuntimeFrame = retainedRuntimeFrame([domIsland("island-a")], 1);
    const nextRuntimeFrame = retainedRuntimeFrame([domIsland("island-b")], 2);
    const committedSurfaceRuntime = createGpuFlowCommittedSurfaceRuntime(
      committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    );
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 120,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomIslandLayer
          committedFrameId={1}
          committedSurfaceRuntime={committedSurfaceRuntime}
          renderDomIsland={(island) => <span>{island.id}</span>}
          retainedRuntimeFrame={firstRuntimeFrame}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    expect(mountedIslandIds()).toEqual(["island-a"]);

    act(() => {
      committedSurfaceRuntime.publishCommittedContentFrame(
        committedSurfaceFrame({
          displayFrameId: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      );
    });

    expect(mountedIslandIds()).toEqual(["island-b"]);
    expect(
      document.querySelector<HTMLElement>(
        "[data-gpu-flow-dom-island-layer='viewport']",
      )?.dataset.gpuFlowDomIslandCommittedFrameId,
    ).toBe("2");
  });
});

function createMockViewportRuntime(
  initialViewport: GpuViewportTuple,
): GpuFlowViewportRuntime {
  let viewport = initialViewport;
  const overlayManagers: Array<{
    readonly applyViewport: (viewport: GpuViewportTuple) => void;
  }> = [];
  return {
    getViewportTuple() {
      return viewport;
    },
    registerOverlayManager(manager) {
      overlayManagers.push(manager);
      manager.applyViewport(viewport);
      return () => {
        const index = overlayManagers.indexOf(manager);
        if (index >= 0) {
          overlayManagers.splice(index, 1);
        }
      };
    },
    setViewport(nextViewport: GpuViewportInput) {
      viewport = Array.isArray(nextViewport)
        ? [nextViewport[0], nextViewport[1], nextViewport[2]]
        : [nextViewport.x, nextViewport.y, nextViewport.zoom];
      for (const manager of overlayManagers) {
        manager.applyViewport(viewport);
      }
    },
  } as unknown as GpuFlowViewportRuntime;
}

function retainedRuntimeFrame(
  islands: readonly GpuDomIsland[],
  frameId: number,
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      nativeDomIslands: islands,
    },
    frameId,
  } as GpuRetainedRuntimeFrame;
}

function committedSurfaceFrame({
  displayFrameId,
  retainedRuntimeFrame,
}: {
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    displayFrameId,
    retainedRuntimeFrame,
    sceneRevision: 1,
  } as GpuFlowCommittedSurfaceFrame;
}

function mountedIslandIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-island='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomIslandId ?? "");
}

function domIsland(id: string): GpuDomIsland {
  const rect = { height: 24, width: 120, x: 0, y: 0 };
  return {
    clipOwnerId: "section-a",
    contentRect: rect,
    id,
    kind: "custom",
    ownerSectionId: "section-a",
    rect,
    source: { kind: "custom" },
    zIndex: 3,
  };
}
