import { describe, expect, it, vi } from "vitest";

import type { HtmlSurfaceTextureEvictionResult } from "../htmlSurfaces/textures";
import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import {
  submitGpuFlowNodeLayerFrameCanvasSubmission,
  type GpuFlowNodeLayerFrameStatePresentation,
} from "./flowFrameLifecycle";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";

describe("GPU Flow node-layer frame texture eviction presentation", () => {
  it("submits deferred texture eviction with the presentation-tokened submission", () => {
    const frame = preparedContentFrame(42);
    const projectionSample = liveProjectionSample(7);
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame,
      projectionSample,
    });
    const submitCanvas = vi.fn();
    const submitTextureEviction = vi.fn(() =>
      textureEvictionResult({
        evictedBytes: 512,
        evictedSurfaceIds: ["old-node"],
      }),
    );

    const submitted = submitGpuFlowNodeLayerFrameCanvasSubmission({
      nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
        submitCanvas,
        submitTextureEviction,
      }),
      token,
    });

    expect(submitCanvas).toHaveBeenCalledTimes(1);
    expect(submitTextureEviction).toHaveBeenCalledTimes(1);
    expect(submitCanvas.mock.invocationCallOrder[0]).toBeLessThan(
      submitTextureEviction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(submitted?.layerResult.canvasSubmission).toBeNull();
    expect(submitted?.layerResult.textureEvictionSubmission).toBeNull();
    expect(submitted?.layerResult.evictedTextureBytes).toBe(512);
    expect(submitted?.layerResult.evictedTextureNodeIds).toEqual(["old-node"]);
  });
});

function nodeLayerFrameStatePresentation({
  submitCanvas,
  submitTextureEviction,
}: {
  readonly submitCanvas: () => void;
  readonly submitTextureEviction: () => HtmlSurfaceTextureEvictionResult;
}): GpuFlowNodeLayerFrameStatePresentation {
  return {
    callbacksRef: { current: {} },
    layerResult: {
      activeNodeId: null,
      budgetExhausted: false,
      canvasSubmission: { submit: submitCanvas },
      deferredNodeIds: [],
      domTransformParkedNodeIds: [],
      domTransformSubmission: null,
      domTransformUpdatedNodeIds: [],
      drawnEdgeIds: [],
      drawnNodeIds: [],
      edgeVertexCount: 0,
      evictedTextureBytes: 0,
      evictedTextureNodeIds: [],
      missingElementNodeIds: [],
      missingTextureNodeIds: [],
      remainingDirtyNodeIds: [],
      skippedNodeIds: [],
      surfaceActorGenerationCount: 0,
      surfaceCoverageProtectedResourceCount: 0,
      surfaceCoverageTrueHoleCount: 0,
      textureEvictionSubmission: { submit: submitTextureEviction },
      textureLifecycleDiagnostics: [],
      textureMemory: textureMemorySnapshot(),
      textureMemoryBeforeEviction: textureMemorySnapshot(),
      uploadDiagnostics: [],
      uploadedNodeIds: [],
      uploadWorkSummary: {
        deferredSurfaceCount: 0,
        initialDirtySurfaceCount: 0,
        initialDirtyWorkCounts: dirtyWorkCounts(),
        noUploadReason: "no-dirty-surfaces",
        paintUnavailableSurfaceCount: 0,
        remainingDirtySurfaceCount: 0,
        remainingDirtyWorkCounts: dirtyWorkCounts(),
        skippedSurfaceCount: 0,
        uploadableRemainingDirtySurfaceCount: 0,
        uploadableRemainingDirtyWorkCounts: dirtyWorkCounts(),
        uploadedSurfaceCount: 0,
      },
      visibleNodeIds: [],
      visualScene: {
        effectSurfaces: [],
        flatSurfaces: [],
        lateFlatSurfaces: [],
        meshSurfaces: [],
        solidRoundedRectSurfaces: [],
        tiledFlatSurfaces: [],
      },
    },
    nodeInteractionRef: { current: null },
    nodeLayerRef: { current: {} },
    retainedRuntimeFrame: {},
    retainedTexturePageFollowUpFrame: false,
    surfaceRef: { current: null },
    switchAnimationFollowUpFrame: false,
    transformOnlyPaintNodeIdsRef: { current: new Set() },
    viewport: [0, 0, 1],
    viewportFrame: false,
    visibleNodeIdsRef: { current: new Set() },
  } as unknown as GpuFlowNodeLayerFrameStatePresentation;
}

function textureEvictionResult({
  evictedBytes,
  evictedSurfaceIds,
}: {
  readonly evictedBytes: number;
  readonly evictedSurfaceIds: readonly string[];
}): HtmlSurfaceTextureEvictionResult {
  return {
    budgetBytes: 1024,
    evictedBytes,
    evictedSurfaceIds,
    memory: textureMemorySnapshot({ allocatedBytes: 512, textureCount: 1 }),
    memoryBefore: textureMemorySnapshot({
      allocatedBytes: 1024,
      textureCount: 2,
    }),
    overBudgetBytes: 0,
    protectedSurfaceIds: ["node-a"],
    reason: "html-surface-frame",
  };
}

function textureMemorySnapshot(
  overrides: Partial<HtmlSurfaceTextureEvictionResult["memory"]> = {},
): HtmlSurfaceTextureEvictionResult["memory"] {
  return {
    allocatedBytes: 0,
    largestTextureBytes: 0,
    textureCount: 0,
    visibleBytes: 0,
    visibleTextureCount: 0,
    ...overrides,
  };
}

function dirtyWorkCounts() {
  return {
    animation: 0,
    content: 0,
    geometry: 0,
    hover: 0,
    resolution: 0,
    "source-window": 0,
  };
}

function preparedContentFrame(
  displayFrameId: number,
): GpuFlowPreparedContentFrame {
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
      obligations: {
        visibleActorIds: [],
      },
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowPreparedContentFrame;
}

function liveProjectionSample(id: number): GpuFlowLiveProjectionSample {
  return {
    id,
    retainedScrollOffsets: new Map(),
    timestamp: id * 16,
    viewport: [0, 0, 1],
  } as unknown as GpuFlowLiveProjectionSample;
}
