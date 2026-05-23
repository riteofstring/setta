import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createRetainedCommittedPageLifecycle } from "../retainedContentLifecycle";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";
import {
  resolveGpuFlowRetainedProjectionFrame,
  type GpuFlowRetainedProjectionFrame,
} from "./visibleFramePublicationKernelProjectionCoverage";

type TestProjectionPublicationFrame = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: null;
};

type TestProjectionFrameTransaction = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedReason: string | null;
  readonly heldPreviousProjection: GpuFlowProjectionFrameRenderablePlan["heldPreviousProjection"] | null;
  readonly outcomeKind: string;
  readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly transaction: GpuFlowProjectionTransaction;
};

describe("GPU flow projection frame coverage", () => {
  it("requires committed retained pages to cover the projected scroll sample", () => {
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample: liveSample({ id: 2, retainedScrollY: 400 }),
    });

    expect(
      resolveGpuFlowRetainedProjectionFrame({
        layer: retainedLayer(),
        retainedDisplayFrame: retainedDisplayFrame({
          pageRects: [{ height: 100, width: 100, x: 0, y: 400 }],
        }),
        transaction,
      }).missingCoverageSurfaceIds.size,
    ).toBe(0);
    expect(
      resolveGpuFlowRetainedProjectionFrame({
        layer: retainedLayer(),
        retainedDisplayFrame: retainedDisplayFrame({
          pageRects: [{ height: 60, width: 100, x: 0, y: 400 }],
        }),
        transaction,
      }).missingCoverageSurfaceIds,
    ).toEqual(new Set(["surface-a"]));
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
    expect(secondHeld.blockedPublicationCandidate?.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);
    expect(secondHeld.outcomeKind).toBe("blocked");
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
}): TestProjectionFrameTransaction {
  const scheduler = createGpuFlowVisiblePublicationScheduler({
    knobs: projectionSchedulerKnobs,
  });
  const selection: {
    blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
    renderPlan: GpuFlowProjectionFrameRenderablePlan | null;
  } = {
    blockedPublicationCandidate: null,
    renderPlan: null,
  };
  const result = runGpuFlowVisibleFramePublicationCandidateSetKernel<
    TestProjectionPublicationFrame,
    TestProjectionPublicationFrame
  >({
    prepareContentPublicationFrame: () => testProjectionPublicationFrame(),
    prepareMotionProjectionFrame: () => ({
      createBlockedProjectionFrame: ({ blockedPublicationCandidate }) => {
        return testProjectionPublicationFrame({
          blockedPublicationCandidate,
        });
      },
      hasActiveRetainedDomControl:
        hasActiveGpuFlowRetainedDomControlCandidate(retainedDisplayFrame),
      kind: "render",
      requestedTransaction,
      resolveRetainedProjectionFrame: ({ transaction }) =>
        resolveGpuFlowRetainedProjectionFrame({
          layer,
          retainedDisplayFrame,
          transaction,
        }),
      renderProjectionFrame: ({ projectionFrameRenderPlan }) => {
        selection.renderPlan = projectionFrameRenderPlan;
        return testProjectionPublicationFrame();
      },
    }),
    publish: (transaction) => {
      selection.blockedPublicationCandidate =
        transaction.preparedFrame.motionProjectionFrame
          .blockedPublicationCandidate;
    },
    sampleVisibleFramePublication: () =>
      visibleFramePublicationSample({
        frameReasons,
        previousVisibleProjectionState: heldPreviousProjectionState,
        sample: requestedTransaction.sample,
    }),
    scheduler,
  });
  const renderPlan = selection.renderPlan;
  if (renderPlan) {
    return {
      blockedPublicationCandidate: null,
      blockedReason: null,
      heldPreviousProjection: renderPlan.heldPreviousProjection,
      outcomeKind: result.outcome.kind,
      retainedProjectionFrame: renderPlan.retainedProjectionFrame,
      transaction: renderPlan.transaction,
    };
  }
  return {
    blockedPublicationCandidate: selection.blockedPublicationCandidate,
    blockedReason:
      selection.blockedPublicationCandidate?.blockedReasons[0]?.reason ?? null,
    heldPreviousProjection: null,
    outcomeKind: result.outcome.kind,
    retainedProjectionFrame: resolveGpuFlowRetainedProjectionFrame({
      layer,
      retainedDisplayFrame,
      transaction: requestedTransaction,
    }),
    transaction: requestedTransaction,
  };
}

function testProjectionPublicationFrame({
  blockedPublicationCandidate = null,
}: {
  readonly blockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
} = {}): TestProjectionPublicationFrame {
  return {
    blockedPublicationCandidate,
    visibleProjectionState: null,
  };
}

function visibleFramePublicationSample({
  frameReasons,
  previousVisibleProjectionState,
  sample,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame: true,
    previousVisibleProjectionState,
    rawReasons: frameReasons,
    runtimeViewportFrame: false,
    sample,
    timestamp: sample.timestamp,
    viewportInteractionActive: frameReasons.includes("viewport"),
  };
}

function hasActiveGpuFlowRetainedDomControlCandidate(
  retainedDisplayFrame: RetainedDisplayFrame,
): boolean {
  return retainedDisplayFrame.retainedRuntimeFrame.descriptors.domControlSources.some(
    (control) => control.active,
  );
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
  pageRects = [{ height: 100, width: 100, x: 0, y: 0 }],
}: {
  readonly activeDomControl?: boolean | undefined;
  readonly pageRects?:
    | readonly RetainedDisplayFrame["drawRegions"][number]["page"]["descriptor"]["sourceRectCss"][]
    | undefined;
} = {}): RetainedDisplayFrame {
  return {
    drawRegions: pageRects.map((sourceRectCss, index) => {
      const descriptor = {
        contentVersion: 1,
        devicePixelRatioBucket: 1,
        lodLevel: 0,
        lodScale: 1,
        pixelHeight: sourceRectCss.height,
        pixelWidth: sourceRectCss.width,
        scaleKey: "1",
        sourceKey: `surface-a:${index}`,
        sourceRectCss,
        sourceVersion: 1,
        sourceWindowCss: sourceRectCss,
        surfaceId: "surface-a",
        tileColumn: 0,
        tileRow: index,
        viewportZoomBucket: 1,
      };
      return {
        page: {
          byteSize: 4,
          committedFrame: 1,
          descriptor,
          key: `page-${index}`,
          lastUsedFrame: 1,
          resource: {
            retainedContentTextureRegion: {
              atlasId: `page-${index}`,
              pixelHeight: sourceRectCss.height,
              pixelWidth: sourceRectCss.width,
              texturePixelHeight: sourceRectCss.height,
              texturePixelWidth: sourceRectCss.width,
              x: 0,
              y: 0,
            },
            sampler: {},
            texture: {},
            textureView: {},
          },
          ...createRetainedCommittedPageLifecycle(descriptor),
        },
        sampleRectCss: sourceRectCss,
      };
    }),
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
