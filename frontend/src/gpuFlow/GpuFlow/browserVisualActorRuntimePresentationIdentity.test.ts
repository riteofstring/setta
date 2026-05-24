/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import {
  committedSurfaceFrame,
  createMockViewportRuntime,
  domControl,
  publicationToken,
  retainedDisplayFrame,
  retainedRuntimeFrame,
} from "./domControlPlaneProjectionRuntimeTestUtils";

describe("GPU Flow browser visual actor runtime presentation identity", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("stamps retired DOM-control hosts with the presentation that parked them", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 120,
      transform: [0, 0, 1],
      width: 400,
    });
    const control = domControl({ index: 0 });
    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.setDomControlElement({
      control,
      element,
      presentation: "preparation",
    });
    const firstFrame = committedSurfaceFrame({
      displayFrameId: 1,
      retainedRuntimeFrame: retainedRuntimeFrame([control], 1),
    });
    const firstToken = publicationToken(firstFrame);
    const firstCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: firstFrame.displayFrameId,
        retainedRuntimeFrame: firstFrame.retainedRuntimeFrame,
      }),
    });
    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate: firstCandidate,
      token: firstToken,
    });

    const retiredFrame = committedSurfaceFrame({
      displayFrameId: 2,
      retainedRuntimeFrame: retainedRuntimeFrame([], 2),
    });
    const retiredToken = publicationToken(retiredFrame);
    const retiredCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: retiredFrame.displayFrameId,
        retainedRuntimeFrame: retiredFrame.retainedRuntimeFrame,
      }),
    });
    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate: retiredCandidate,
      token: retiredToken,
    });

    expect(element.style.display).toBe("none");
    expect(element.style.pointerEvents).toBe("none");
    expect(element.dataset.gpuFlowContentFrameId).toBe(
      String(retiredToken.contentFrameId),
    );
    expect(element.dataset.gpuFlowPresentationId).toBe(
      String(retiredToken.presentationId),
    );
  });

  it("stamps retired DOM-island hosts with the presentation that hid them", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const island = domIsland("island-a");
    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomIslandElement({
      element,
      islandId: island.id,
      presentation: "preparation",
    });
    const firstFrame = committedSurfaceFrame({
      displayFrameId: 1,
      retainedRuntimeFrame: retainedRuntimeFrameWithDomIslands([island], 1),
    });
    const firstToken = publicationToken(firstFrame);
    const firstCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrameInput(firstFrame),
    });
    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate: firstCandidate,
      token: firstToken,
    });
    expect(element.dataset.gpuFlowDomIsland).toBe("true");

    const retiredFrame = committedSurfaceFrame({
      displayFrameId: 2,
      retainedRuntimeFrame: retainedRuntimeFrameWithDomIslands([], 2),
    });
    const retiredToken = publicationToken(retiredFrame);
    const retiredCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrameInput(retiredFrame),
    });
    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate: retiredCandidate,
      token: retiredToken,
    });

    expect(element.dataset.gpuFlowDomIsland).toBeUndefined();
    expect(element.style.display).toBe("none");
    expect(element.style.pointerEvents).toBe("none");
    expect(element.dataset.gpuFlowContentFrameId).toBe(
      String(retiredToken.contentFrameId),
    );
    expect(element.dataset.gpuFlowPresentationId).toBe(
      String(retiredToken.presentationId),
    );
  });
});

function retainedDisplayFrameInput(
  frame: ReturnType<typeof committedSurfaceFrame>,
): RetainedDisplayFrame {
  return {
    id: frame.displayFrameId,
    retainedRuntimeFrame: frame.retainedRuntimeFrame,
  } as RetainedDisplayFrame;
}

function retainedRuntimeFrameWithDomIslands(
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
