import { describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  createGpuFlowProjectionTransactionForPreparedContentFrameId,
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowMotionProjectionFrameWorkReport,
  type GpuFlowVisibleFrameBlockedPresentationCandidate,
  type GpuFlowVisibleFramePresentationSample,
} from "./visibleFrameCoordinator";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";

describe("GPU Flow visible frame coordinator projection work", () => {
  it("mints retained projection blocked tokens from projection work reports inside the transaction proof", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime({
      knobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 0,
        maxHeldPreviousMs: 0,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
    });
    const sample = liveProjectionSample({ id: 31, timestamp: 316 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 30, timestamp: 300 }),
    });
    let presentedOutcomeKind: string | null = null;
    type TestContentPreparationFrame = {
      readonly blockedPresentationCandidate: null;
      readonly rendered: boolean;
      readonly visibleProjectionState: null;
    };
    type TestMotionProjectionFrame = {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly projectionOnlyFrameWork: GpuFlowMotionProjectionFrameWorkReport | null;
      readonly rendered: boolean;
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };
    const result = runGpuFlowVisibleFrameCoordinator<
      TestContentPreparationFrame,
      TestMotionProjectionFrame
    >({
      prepareContentPreparationFrame: () => ({
        blockedPresentationCandidate: null,
        rendered: false,
        visibleProjectionState: null,
      }),
      prepareMotionProjectionFrame: () => ({
        createBlockedProjectionFrame: ({ blockedPresentationCandidate }) => ({
          blockedPresentationCandidate,
          projectionOnlyFrameWork: null,
          rendered: false,
          visibleProjectionState: null,
        }),
        kind: "render",
        requestedTransaction: retainedProjectionTransaction({ sample }),
        resolveRetainedProjectionFrame: () => retainedProjectionFrame(),
        renderProjectionFrame: () => ({
          blockedPresentationCandidate: null,
          projectionOnlyFrameWork: projectionOnlyContentWorkReport(),
          rendered: true,
          visibleProjectionState: visibleProjectionState({
            kind: "motion-projection",
            sample,
          }),
        }),
      }),
      onPresentation: (transaction) => {
        presentedOutcomeKind = transaction.outcome.kind;
      },
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          previousVisibleProjectionState,
          rawReasons: ["retained-scroll"],
          sample,
          viewportInteractionActive: true,
        }),
      reducerRuntime: scheduler,
    });

    expect(result.outcome.kind).toBe("blocked");
    expect(presentedOutcomeKind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected coordinator blocked outcome.");
    }
    expect(result.outcome.token.frozenFrame.kind).toBe("committed");
    expect(result.outcome.token.frozenFrame).toEqual({
      frameId:
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
      kind: "committed",
    });
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "projection-only-content-work",
      },
    ]);
    expect(result.outcome.token.projectionSampleId).toBe(sample.id);
    const reducerCompletion = result.completeReducerFrame();
    expect(reducerCompletion.completion.debt.motion).toBe(true);
    expect(reducerCompletion.debtFrameRequest).toEqual({
      delayMs: 160,
      frameReason: "texture-upload",
    });
  });
});

function projectionOnlyContentWorkReport(): GpuFlowMotionProjectionFrameWorkReport {
  return {
    layerResult: {
      budgetExhausted: false,
      deferredNodeIds: [],
      evictedTextureBytes: 0,
      evictedTextureNodeIds: [],
      missingElementNodeIds: [],
      remainingDirtyNodeIds: [],
      skippedNodeIds: [],
      uploadedNodeIds: ["node-a"],
    },
    projectionLane: "motion",
    transactionKind: "motion-projection",
  };
}

function retainedProjectionTransaction({
  sample,
}: {
  readonly sample: GpuFlowLiveProjectionSample;
}) {
  return createGpuFlowProjectionTransactionForPreparedContentFrameId({
    preparedContentFrameId: 12,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample,
  });
}

function retainedProjectionFrame(): GpuFlowRetainedProjectionFrame {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set<string>(),
    needsRetainedPageMaintenance: false,
  };
}

function visibleProjectionState({
  kind,
  sample,
}: {
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const preparedContentFrame = createPreparedContentFrame();
  return {
    preparedContentFrame,
    heldPreviousProjection: null,
    sample,
    transaction: {
      preparedContentFrameId: preparedContentFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample,
      startedAtMs: sample.timestamp,
    },
  } as unknown as GpuFlowVisibleProjectionState;
}

function createPreparedContentFrame(): GpuFlowPreparedContentFrame {
  const displayFrameId = 7;
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
    },
  } as unknown as GpuFlowPreparedContentFrame;
}

type VisibleFramePresentationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePresentationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePresentationSample({
  hasPresentedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: VisibleFramePresentationSampleInput): GpuFlowVisibleFramePresentationSample {
  return {
    hasPresentedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    viewportInteractionActive,
  };
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
