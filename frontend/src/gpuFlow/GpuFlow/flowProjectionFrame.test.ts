import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { RetainedContentTexturePageFrameSurface } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  isGpuFlowRetainedProjectionSurfaceCovered,
  resolveGpuFlowRetainedProjectionFrame,
} from "./flowProjectionFrame";
import {
  decideGpuFlowRetainedProjectionPublicationTransaction,
  hasActiveGpuFlowRetainedDomControlPublicationProof,
  selectGpuFlowProjectionFrameTransactionFromPublicationDecision,
} from "./visibleFramePublicationKernel";
import {
  assertGpuFlowMotionProjectionFrameWork,
  selectGpuFlowMotionProjectionFrameWorkBlockedReason,
} from "./visibleFramePublicationProjectionWorkAuthority";

describe("GPU flow projection frame coverage", () => {
  it("requires committed retained pages to cover the projected scroll sample", () => {
    const surface = retainedSurface({ height: 100, width: 100, x: 0, y: 0 });

    expect(
      isGpuFlowRetainedProjectionSurfaceCovered({
        pages: retainedPages([
          { height: 50, width: 100, x: 0, y: 0 },
          { height: 50, width: 100, x: 0, y: 50 },
        ]),
        surface,
      }),
    ).toBe(true);
    expect(
      isGpuFlowRetainedProjectionSurfaceCovered({
        pages: retainedPages([{ height: 60, width: 100, x: 0, y: 0 }]),
        surface,
      }),
    ).toBe(false);
  });

  it("rejects uploads and resource churn during projection-only frames", () => {
    expect(
      selectGpuFlowMotionProjectionFrameWorkBlockedReason({
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
        projectionLane: "motion",
        transactionKind: "motion-projection",
      }),
    ).toBe("projection-only-content-work");

    expect(() =>
      assertGpuFlowMotionProjectionFrameWork({
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
        projectionLane: "motion",
        transactionKind: "motion-projection",
      }),
    ).toThrow(/forbidden content work/);

    expect(() =>
      assertGpuFlowMotionProjectionFrameWork({
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
        projectionLane: "maintenance",
        transactionKind: "content-publication",
      }),
    ).not.toThrow();
    expect(
      selectGpuFlowMotionProjectionFrameWorkBlockedReason({
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
        projectionLane: "maintenance",
        transactionKind: "content-publication",
      }),
    ).toBeNull();

    expect(() =>
      assertGpuFlowMotionProjectionFrameWork({
        layerResult: projectionLayerResult({
          remainingDirtyNodeIds: ["node-a"],
          skippedNodeIds: ["node-a"],
        }),
        projectionLane: "motion",
        transactionKind: "held-previous",
      }),
    ).not.toThrow();
  });

  it("holds the previous frame for the requested projection sample when retained projection coverage is missing", () => {
    const previousSample = liveSample({
      id: 1,
      retainedScrollY: 0,
    });
    const requestedSample = liveSample({
      id: 2,
      retainedScrollY: 400,
    });
    const requestedTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 12,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll", "paint", "texture-upload"],
        sample: requestedSample,
      });

    const result = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll", "paint", "texture-upload"],
      heldPreviousProjectionState: visibleProjectionState({
        committedFrameId: 11,
        sample: previousSample,
      }),
      layer: retainedLayer(),
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction,
    });

    expect(result.transaction.kind).toBe("held-previous");
    expect(result.transaction.committedFrameId).toBe(11);
    expect(result.transaction.sample.id).toBe(2);
    expect(result.heldPreviousProjection).toEqual(
      expect.objectContaining({
        consecutiveFrameCount: 1,
        heldDurationMs: 0,
        projectionSampleId: 2,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: 2,
      }),
    );
    expect(result.retainedProjectionFrame.needsRetainedPageMaintenance).toBe(
      true,
    );
  });

  it("projects retained scroll from the transaction sample rather than raw reasons", () => {
    const previousSample = liveSample({
      id: 1,
      retainedScrollY: 0,
    });
    const requestedTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 12,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["manual"],
        sample: liveSample({
          id: 2,
          retainedScrollY: 400,
        }),
      });

    const result = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["manual"],
      heldPreviousProjectionState: visibleProjectionState({
        committedFrameId: 11,
        sample: previousSample,
      }),
      layer: retainedLayer(),
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction,
    });

    expect(result.transaction.kind).toBe("held-previous");
    expect(result.heldPreviousProjection).toEqual(
      expect.objectContaining({
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: 2,
      }),
    );
    expect(result.retainedProjectionFrame.needsRetainedPageMaintenance).toBe(
      true,
    );
  });

  it("blocks held-previous projection after the scheduler budget is exceeded", () => {
    const previousSample = liveSample({
      id: 1,
      retainedScrollY: 0,
    });
    const firstHeld = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll"],
      heldPreviousProjectionState: visibleProjectionState({
        committedFrameId: 11,
        sample: previousSample,
      }),
      layer: retainedLayer(),
      projectionSchedulerKnobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction:
        createGpuFlowProjectionTransactionForCommittedFrameId({
          committedFrameId: 12,
          kind: "motion-projection",
          lane: "motion",
          rawReasons: ["retained-scroll"],
          sample: liveSample({ id: 2, retainedScrollY: 400 }),
        }),
    });
    const secondHeld = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll"],
      heldPreviousProjectionState: createGpuFlowVisibleProjectionState({
        committedFrame: {
          displayFrameId: 11,
        } as GpuFlowCommittedSurfaceFrame,
        heldPreviousProjection: firstHeld.heldPreviousProjection,
        transaction: firstHeld.transaction,
      }),
      layer: retainedLayer(),
      projectionSchedulerKnobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction:
        createGpuFlowProjectionTransactionForCommittedFrameId({
          committedFrameId: 12,
          kind: "motion-projection",
          lane: "motion",
          rawReasons: ["retained-scroll"],
          sample: liveSample({ id: 10, retainedScrollY: 500 }),
        }),
    });

    expect(secondHeld.blockedReason).toBe("held-previous-budget-exceeded");
    expect(secondHeld.transaction.kind).toBe("motion-projection");
    expect(secondHeld.transaction.sample.id).toBe(10);
    expect(secondHeld.heldPreviousProjection).toEqual(
      expect.objectContaining({
        consecutiveFrameCount: 2,
        heldDurationMs: 8,
        maxHeldPreviousFramesExceeded: true,
        maxHeldPreviousMsExceeded: true,
      }),
    );
  });

  it("publishes the requested projection after the held-previous budget when an active DOM control is waiting", () => {
    const previousSample = liveSample({
      id: 1,
      retainedScrollY: 0,
    });
    const firstHeld = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll"],
      heldPreviousProjectionState: visibleProjectionState({
        committedFrameId: 11,
        sample: previousSample,
      }),
      layer: retainedLayer(),
      projectionSchedulerKnobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction:
        createGpuFlowProjectionTransactionForCommittedFrameId({
          committedFrameId: 12,
          kind: "motion-projection",
          lane: "motion",
          rawReasons: ["retained-scroll"],
          sample: liveSample({ id: 2, retainedScrollY: 400 }),
        }),
    });
    const requestedTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 12,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: liveSample({ id: 10, retainedScrollY: 500 }),
      });

    const secondHeld = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll"],
      heldPreviousProjectionState: createGpuFlowVisibleProjectionState({
        committedFrame: {
          displayFrameId: 11,
        } as GpuFlowCommittedSurfaceFrame,
        heldPreviousProjection: firstHeld.heldPreviousProjection,
        transaction: firstHeld.transaction,
      }),
      layer: retainedLayer(),
      projectionSchedulerKnobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      retainedDisplayFrame: retainedDisplayFrame({ activeDomControl: true }),
      requestedTransaction,
    });

    expect(secondHeld.blockedReason).toBeNull();
    expect(secondHeld.heldPreviousProjection).toBeNull();
    expect(secondHeld.transaction).toBe(requestedTransaction);
    expect(
      secondHeld.retainedProjectionFrame.needsRetainedPageMaintenance,
    ).toBe(true);
  });
});

function resolveGpuFlowProjectionFrameTransaction({
  frameReasons,
  heldPreviousProjectionState,
  layer,
  projectionSchedulerKnobs,
  retainedDisplayFrame,
  requestedTransaction,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly layer: GpuFlowNodeLayerState;
  readonly projectionSchedulerKnobs?: GpuFlowProjectionSchedulerKnobs;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}) {
  const requestedRetainedProjectionFrame =
    resolveGpuFlowRetainedProjectionFrame({
      layer,
      retainedDisplayFrame,
      transaction: requestedTransaction,
    });
  const publicationDecision =
    decideGpuFlowRetainedProjectionPublicationTransaction({
      frameReasons,
      hasActiveRetainedDomControl:
        hasActiveGpuFlowRetainedDomControlPublicationProof(
          retainedDisplayFrame,
        ),
      heldPreviousProjectionState,
      projectionSchedulerKnobs,
      requestedProjectionCoverageMissing:
        requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0,
      requestedTransaction,
    });
  return selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
    publicationDecision,
    requestedRetainedProjectionFrame,
    resolveHeldRetainedProjectionFrame: ({ transaction }) =>
      resolveGpuFlowRetainedProjectionFrame({
        layer,
        retainedDisplayFrame,
        transaction,
      }),
  });
}

function retainedSurface(
  visibleSourceRectCss: RetainedContentTexturePageFrameSurface["visibleSourceRectCss"],
): RetainedContentTexturePageFrameSurface {
  return {
    visibleSourceRectCss,
  } as RetainedContentTexturePageFrameSurface;
}

function retainedPages(
  rects: readonly RetainedDisplayFrame["drawRegions"][number]["page"]["descriptor"]["sourceRectCss"][],
): ReadonlyMap<string, RetainedDisplayFrame["drawRegions"][number]["page"]> {
  return new Map(
    rects.map((sourceRectCss, index) => [
      `page-${index}`,
      {
        descriptor: {
          sourceRectCss,
        },
      } as RetainedDisplayFrame["drawRegions"][number]["page"],
    ]),
  );
}

function projectionLayerResult(
  overrides: Partial<
    Parameters<typeof assertGpuFlowMotionProjectionFrameWork>[0]["layerResult"]
  > = {},
): Parameters<typeof assertGpuFlowMotionProjectionFrameWork>[0]["layerResult"] {
  return {
    budgetExhausted: false,
    deferredNodeIds: [],
    evictedTextureBytes: 0,
    evictedTextureNodeIds: [],
    missingElementNodeIds: [],
    remainingDirtyNodeIds: [],
    skippedNodeIds: [],
    uploadedNodeIds: [],
    ...overrides,
  };
}

function liveSample({
  id,
  retainedScrollY,
}: {
  readonly id: number;
  readonly retainedScrollY: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 100, width: 100 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map([["surface-a", { x: 0, y: retainedScrollY }]]),
    retainedScrollOffsets: new Map([
      ["surface-a", { x: 0, y: retainedScrollY }],
    ]),
    retainedScrollRevision: id,
    retainedScrollVelocityCssPxPerMs: new Map([["surface-a", { x: 0, y: 0 }]]),
    timestamp: id,
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}

function visibleProjectionState({
  committedFrameId,
  sample,
}: {
  readonly committedFrameId: number;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample,
  });
  return createGpuFlowVisibleProjectionState({
    committedFrame: {
      displayFrameId: committedFrameId,
    } as GpuFlowCommittedSurfaceFrame,
    transaction,
  });
}

function retainedLayer(): GpuFlowNodeLayerState {
  return {
    scene: retainedScene(),
    viewport: { x: 0, y: 0, zoom: 1 },
  } as GpuFlowNodeLayerState;
}

function retainedScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedContentSurface(): GpuContentSurface {
  const rect = { height: 100, width: 100, x: 0, y: 0 };
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
      rowHeight: 20,
      rows: Array.from({ length: 30 }, (_, index) => ({
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

function retainedDisplayFrame({
  activeDomControl = false,
}: {
  readonly activeDomControl?: boolean | undefined;
} = {}): RetainedDisplayFrame {
  return {
    drawRegions: [
      {
        page: {
          descriptor: {
            sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
            surfaceId: "surface-a",
          },
          key: "page-a",
        },
        sampleRectCss: { height: 100, width: 100, x: 0, y: 0 },
      },
    ],
    flatSurfaces: [],
    retainedRuntimeFrame: {
      descriptors: {
        domControlSources: activeDomControl ? [{ active: true }] : [],
      },
      input: {
        scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
        viewportZoomBucket: 1,
      },
    },
  } as unknown as RetainedDisplayFrame;
}
