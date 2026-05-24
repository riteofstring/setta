/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import { createGpuFlowPresentedSurfaceRuntime } from "../presentedSurfaceRuntime";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import {
  normalizeGpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { getGpuFlowBrowserVisualActorRuntimeForPresentedSurface } from "./browserVisualActorRuntime";
import { GpuFlowDomIslandLayer } from "./domIslandLayer";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";

let root: Root | null = null;

describe("GPU Flow DOM island layer", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("tracks presented-frame store updates when React semantic rendering dedupes", async () => {
    const firstRuntimeFrame = retainedRuntimeFrame([domIsland("island-a")], 1);
    const nextRuntimeFrame = retainedRuntimeFrame([domIsland("island-b")], 2);
    const presentedSurfaceRuntime = createGpuFlowPresentedSurfaceRuntime(
      preparedContentFrame({
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
    publishBrowserVisualFrame({
      presentedSurfaceRuntime,
      frame: preparedContentFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
      viewportRuntime,
      viewportStore,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomIslandLayer
          presentedSurfaceRuntime={presentedSurfaceRuntime}
          renderDomIsland={(island) => <span>{island.id}</span>}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    expect(mountedIslandIds()).toEqual(["island-a"]);

    const nextToken = await publishBrowserVisualFrameInAct({
      presentedSurfaceRuntime,
      displayFrameId: 2,
      retainedRuntimeFrame: nextRuntimeFrame,
      viewportRuntime,
      viewportStore,
    });

    expect(mountedIslandIds()).toEqual(["island-b"]);
    expect(
      document.querySelector<HTMLElement>(
        "[data-gpu-flow-dom-island-layer='viewport']",
      )?.dataset.gpuFlowDomIslandPreparedContentFrameId,
    ).toBe("2");
    expectDomIslandPresentationIdentity(nextToken);

    const projectionToken = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: presentedSurfaceRuntime.getPresentedContentFrame(),
      projectionSample: { id: 42 } as GpuFlowLiveProjectionSample,
    });
    await act(async () => {
      getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
        presentedSurfaceRuntime,
      ).projectDomIslands({
        token: projectionToken,
        viewport: [16, 0, 1],
      });
      await nextMicrotask();
    });

    expectDomIslandPresentationIdentity(projectionToken);
  });
});

async function publishBrowserVisualFrameInAct({
  presentedSurfaceRuntime,
  displayFrameId,
  retainedRuntimeFrame,
  viewportRuntime,
  viewportStore,
}: {
  readonly presentedSurfaceRuntime: ReturnType<
    typeof createGpuFlowPresentedSurfaceRuntime
  >;
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: ReturnType<typeof createGpuFlowViewportStore>;
}): Promise<ReturnType<typeof publicationToken>> {
  let token: ReturnType<typeof publicationToken> | null = null;
  await act(async () => {
    const frame = preparedContentFrame({
      displayFrameId,
      retainedRuntimeFrame,
    });
    token = publishBrowserVisualFrame({
      presentedSurfaceRuntime,
      frame,
      viewportRuntime,
      viewportStore,
    });
    await nextMicrotask();
  });
  if (token === null) {
    throw new Error("Expected DOM island publication token.");
  }
  return token;
}

function expectDomIslandPresentationIdentity(
  token: ReturnType<typeof publicationToken>,
): void {
  const layer = document.querySelector<HTMLElement>(
    "[data-gpu-flow-dom-island-layer='viewport']",
  );
  expect(layer?.dataset.gpuFlowContentFrameId).toBe(
    String(token.contentFrameId),
  );
  expect(layer?.dataset.gpuFlowPresentationId).toBe(
    String(token.presentationId),
  );
  const island = document.querySelector<HTMLElement>(
    "[data-gpu-flow-dom-island='true']",
  );
  expect(island?.dataset.gpuFlowContentFrameId).toBe(
    String(token.contentFrameId),
  );
  expect(island?.dataset.gpuFlowPresentationId).toBe(
    String(token.presentationId),
  );
}

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
      const normalizedViewport = normalizeGpuViewport(nextViewport);
      viewport = [
        normalizedViewport.x,
        normalizedViewport.y,
        normalizedViewport.zoom,
      ];
      for (const manager of overlayManagers) {
        manager.applyViewport(viewport);
      }
    },
  } as unknown as GpuFlowViewportRuntime;
}

function publishBrowserVisualFrame({
  presentedSurfaceRuntime,
  frame,
  viewportRuntime,
  viewportStore,
}: {
  readonly presentedSurfaceRuntime: ReturnType<
    typeof createGpuFlowPresentedSurfaceRuntime
  >;
  readonly frame: GpuFlowPreparedContentFrame;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: ReturnType<typeof createGpuFlowViewportStore>;
}): ReturnType<typeof publicationToken> {
  const browserVisualRuntime =
    getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
      presentedSurfaceRuntime,
    );
  browserVisualRuntime.setDomIslandProjectionEnvironment({
    viewportRuntime,
    viewportStore,
  });
  const token = publicationToken(frame);
  const candidate = browserVisualRuntime.prepareContentFrame({
    retainedDisplayFrame: {
      id: frame.displayFrameId,
      retainedRuntimeFrame: frame.retainedRuntimeFrame,
    } as RetainedDisplayFrame,
  });
  browserVisualRuntime.commitPreparedBrowserVisualActors({ candidate, token });
  presentedSurfaceRuntime.publishPresentedContentFrame(token, frame);
  return token;
}

function retainedRuntimeFrame(
  islands: readonly GpuDomIsland[],
  frameId: number,
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: [],
      nativeDomIslands: islands,
      sceneSections: [],
      sourceSurfaces: [],
    },
    frameId,
  } as unknown as GpuRetainedRuntimeFrame;
}

function preparedContentFrame({
  displayFrameId,
  retainedRuntimeFrame,
}: {
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowPreparedContentFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    retainedRuntimeFrame,
    sceneRevision: 1,
    surfaceTransaction: null,
  } as unknown as GpuFlowPreparedContentFrame;
}

function publicationToken(frame: GpuFlowPreparedContentFrame) {
  return createGpuFlowVisibleFramePresentationTokenForTest({
    frame,
    projectionSample: {
      id: frame.displayFrameId,
    } as GpuFlowLiveProjectionSample,
  });
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

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
