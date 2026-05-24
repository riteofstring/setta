import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleFrameRequestCoordinator,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createRetainedCommittedPageLifecycle } from "../retainedContentLifecycle";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { HtmlSurfaceFlatVisual } from "../htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  resolveGpuFlowProjectionHtmlSurfaceNativeVisuals,
  resolveGpuFlowProjectionRetainedRuntimeFrame,
} from "./flowProjectionFrame";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";
import {
  resolveGpuFlowRetainedProjectionFrame,
  type GpuFlowRetainedProjectionFrame,
} from "./visibleFrameProjectionCoverage";

type TestProjectionPublicationFrame = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: null;
};

type TestProjectionFrameTransaction = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedReason: string | null;
  readonly heldPreviousProjection:
    | GpuFlowProjectionFrameRenderablePlan["heldPreviousProjection"]
    | null;
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

  it("replaces stale retained page visuals for a changed retained scroll surface", () => {
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample: liveSample({ id: 2, retainedScrollY: 400 }),
    });
    const result = resolveGpuFlowRetainedProjectionFrame({
      layer: retainedLayer(),
      retainedDisplayFrame: retainedDisplayFrame({
        flatSurfaces: [flatSurface("page-0")],
        pageRects: [
          { height: 100, width: 100, x: 0, y: 0 },
          { height: 100, width: 100, x: 0, y: 400 },
        ],
      }),
      transaction,
    });

    expect(result.missingCoverageSurfaceIds.size).toBe(0);
    expect(result.flatSurfaces.map((surface) => surface.surfaceId)).toEqual([
      "page-1",
    ]);
    expect(result.flatSurfaces[0]).toEqual(
      expect.objectContaining({
        height: 100,
        width: 100,
        x: 0,
        y: 0,
      }),
    );
  });

  it("treats retained scroll projection through a newer layer scene as missing coverage", () => {
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample: liveSample({ id: 2, retainedScrollY: 400 }),
    });
    const result = resolveGpuFlowRetainedProjectionFrame({
      layer: retainedLayer({
        scene: {
          ...retainedScene(),
          revision: 2,
        },
      }),
      retainedDisplayFrame: retainedDisplayFrame({
        flatSurfaces: [flatSurface("page-0")],
        pageRects: [{ height: 100, width: 100, x: 0, y: 0 }],
      }),
      transaction,
    });

    expect(result.flatSurfaces.map((surface) => surface.surfaceId)).toEqual([
      "page-0",
    ]);
    expect(result.missingCoverageSurfaceIds).toEqual(new Set(["surface-a"]));
    expect(result.needsRetainedPageMaintenance).toBe(true);
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

  it("samples native scrollbar visuals from motion projection scroll offsets", () => {
    const layer = retainedLayer();
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample: liveSample({
        id: 2,
        retainedScrollY: 400,
      }),
    });
    const frame = resolveGpuFlowProjectionRetainedRuntimeFrame({
      canvasSize: canvasSize(),
      fallbackRetainedRuntimeFrame: createGpuRetainedRuntimeFrame({
        devicePixelRatioBucket: 1,
        frameId: 1,
        scene: layer.scene,
        scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
        scrollRevision: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportSize: { height: 100, width: 100 },
        viewportZoomBucket: 1,
      }),
      frame: 2,
      heldPreviousProjectionState: null,
      layer,
      transaction,
    });

    const thumbVisual = frame.descriptors.htmlSurfaceNativeVisuals.find(
      (visual) => visual.surfaceId === "surface-a:scrollbar:y:thumb",
    );
    expect(frame.input.scrollOffsets.get("surface-a")).toEqual({
      x: 0,
      y: 400,
    });
    expect(thumbVisual?.rect.y).toBeGreaterThan(2);
  });

  it("keeps the committed retained runtime frame when the live layer scene changed", () => {
    const committedLayer = retainedLayer();
    const fallbackRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: committedLayer.scene,
      scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
      scrollRevision: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 100, width: 100 },
      viewportZoomBucket: 1,
    });
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample: liveSample({
        id: 2,
        retainedScrollY: 400,
      }),
    });
    const frame = resolveGpuFlowProjectionRetainedRuntimeFrame({
      canvasSize: canvasSize(),
      fallbackRetainedRuntimeFrame,
      frame: 2,
      heldPreviousProjectionState: null,
      layer: retainedLayer({
        scene: {
          ...retainedScene(),
          revision: 2,
        },
      }),
      transaction,
    });

    expect(frame).toBe(fallbackRetainedRuntimeFrame);
    expect(frame.input.scrollOffsets.get("surface-a")).toEqual({ x: 0, y: 0 });
  });

  it("keeps the committed retained runtime frame when row hover differs without a native visual reason", () => {
    const layer = retainedLayer({
      retainedContentRowHoverTarget: {
        rowId: "row-2",
        surfaceId: "surface-a",
      },
    });
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["manual"],
      sample: liveSample({
        id: 2,
        retainedScrollY: 0,
      }),
    });
    const fallbackRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: layer.scene,
      scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
      scrollRevision: 2,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 100, width: 100 },
      viewportZoomBucket: 1,
    });

    const frame = resolveGpuFlowProjectionRetainedRuntimeFrame({
      canvasSize: canvasSize(),
      fallbackRetainedRuntimeFrame,
      frame: 2,
      frameReasons: ["manual"],
      heldPreviousProjectionState: null,
      layer,
      transaction,
    });

    expect(frame).toBe(fallbackRetainedRuntimeFrame);
    expect(
      frame.descriptors.htmlSurfaceNativeVisuals.map(
        (visual) => visual.surfaceId,
      ),
    ).not.toContain("surface-a:row-hover:row-2");
  });

  it("samples retained row hover visuals during motion projection", () => {
    const layer = retainedLayer({
      retainedContentRowHoverTarget: {
        rowId: "row-2",
        surfaceId: "surface-a",
      },
    });
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 12,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-row-hover-visual"],
      sample: liveSample({
        id: 2,
        retainedScrollY: 0,
      }),
    });
    const frame = resolveGpuFlowProjectionRetainedRuntimeFrame({
      canvasSize: canvasSize(),
      fallbackRetainedRuntimeFrame: createGpuRetainedRuntimeFrame({
        devicePixelRatioBucket: 1,
        frameId: 1,
        scene: layer.scene,
        scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
        scrollRevision: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportSize: { height: 100, width: 100 },
        viewportZoomBucket: 1,
      }),
      frame: 2,
      frameReasons: ["retained-row-hover-visual"],
      heldPreviousProjectionState: null,
      layer,
      transaction,
    });

    expect(
      frame.descriptors.htmlSurfaceNativeVisuals.map(
        (visual) => visual.surfaceId,
      ),
    ).toContain("surface-a:row-hover:row-2");
  });

  it("projects active retained switch native visuals during motion projection", () => {
    const scene = retainedSwitchScene(true);
    const switchAnimations = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 100,
      prefersReducedMotion: () => false,
    });
    switchAnimations.beginTransition({
      fromChecked: true,
      nowMs: 0,
      rowId: "switch-row",
      surfaceId: "surface-a",
      toChecked: false,
    });
    const projectionRetainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene,
      scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
      scrollRevision: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { height: 100, width: 100 },
      viewportZoomBucket: 1,
    });

    const visuals = resolveGpuFlowProjectionHtmlSurfaceNativeVisuals({
      darkMode: true,
      nowMs: 50,
      projectionRetainedRuntimeFrame,
      scene,
      switchAnimations,
    });

    expect(visuals?.map((visual) => visual.surfaceId)).toEqual([
      "surface-a:switch-animation:switch-row:track",
      "surface-a:switch-animation:switch-row:thumb",
    ]);
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

    expect(secondHeld.blockedReason).toBeNull();
    expect(secondHeld.transaction.kind).toBe("held-previous");
    expect(secondHeld.transaction.sample.id).toBe(10);
    expect(secondHeld.heldPreviousProjection).toEqual(
      expect.objectContaining({
        maxHeldPreviousFramesExceeded: true,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: 10,
      }),
    );
    expect(secondHeld.blockedPublicationCandidate).toBeNull();
    expect(secondHeld.outcomeKind).toBe("blocked");
  });

  it("keeps holding the previous complete projection when an active DOM control lacks retained coverage", () => {
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
    expect(secondHeld.heldPreviousProjection).toEqual(
      expect.objectContaining({
        maxHeldPreviousFramesExceeded: true,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: 10,
      }),
    );
    expect(secondHeld.transaction.kind).toBe("held-previous");
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
  const scheduler = createGpuFlowVisibleFrameRequestCoordinator({
    knobs: projectionSchedulerKnobs,
  });
  const selection: {
    blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
    renderPlan: GpuFlowProjectionFrameRenderablePlan | null;
  } = {
    blockedPublicationCandidate: null,
    renderPlan: null,
  };
  const result = runGpuFlowVisibleFrameCoordinator<
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
        transaction.preparedFrame.motionProjectionFrame.blockedPublicationCandidate;
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

function retainedLayer(
  overrides: Partial<GpuFlowNodeLayerState> = {},
): GpuFlowNodeLayerState {
  return {
    scene: retainedScene(),
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
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

function retainedSwitchScene(checked: boolean): GpuFlowScene {
  return {
    contentSurfaces: [retainedSwitchContentSurface(checked)],
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

function retainedSwitchContentSurface(checked: boolean): GpuContentSurface {
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
      rowHeight: 28,
      rows: [
        {
          control: {
            checked,
            commitPolicy: "immediate",
            defaultDisplayValue: String(checked),
            displayValue: String(checked),
            kind: "switch",
            rendererFamily: "switch",
          },
          controlKind: "switch",
          depth: 0,
          id: "switch-row",
          label: "Switch Row",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: rect,
    }),
    zIndex: 1,
  };
}

function canvasSize() {
  return {
    cssHeight: 100,
    cssWidth: 100,
    devicePixelRatio: 1,
    pixelHeight: 100,
    pixelWidth: 100,
  };
}

function retainedDisplayFrame({
  activeDomControl = false,
  flatSurfaces = [],
  pageRects = [{ height: 100, width: 100, x: 0, y: 0 }],
}: {
  readonly activeDomControl?: boolean | undefined;
  readonly flatSurfaces?: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly pageRects?:
    | readonly RetainedDisplayFrame["drawRegions"][number]["page"]["descriptor"]["sourceRectCss"][]
    | undefined;
} = {}): RetainedDisplayFrame {
  const drawRegions = pageRects.map((sourceRectCss, index) => {
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
      textureHandle: `page-${index}`,
    };
  });
  return {
    drawRegions,
    flatSurfaces,
    retainedRuntimeFrame: {
      descriptors: {
        domControlSources: activeDomControl ? [{ active: true }] : [],
        sourceSurfaces: [{ id: "surface-a" }],
      },
      input: {
        sceneRevision: 1,
        scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
        viewportZoomBucket: 1,
      },
    },
  } as unknown as RetainedDisplayFrame;
}

function flatSurface(surfaceId: string): HtmlSurfaceFlatVisual {
  return {
    height: 100,
    kind: "flat",
    surfaceId,
    texture: {} as HtmlSurfaceFlatVisual["texture"],
    width: 100,
    x: 0,
    y: 0,
    zIndex: 1,
  };
}
