import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { GpuFlowRetainedProjectionFrame } from "./flowProjectionFrame";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";
import type { GpuFlowMotionProjectionFrameWorkReport } from "./visibleFramePublicationProjectionWorkAuthority";

describe("GPU Flow visible publication kernel projection work authority", () => {
  it("mints retained projection blocked tokens from projection work reports inside the kernel", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler({
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
    let publishedOutcomeKind: string | null = null;
    type TestContentPublicationFrame = {
      readonly blockedPublicationCandidate: null;
      readonly rendered: boolean;
      readonly visibleProjectionState: null;
    };
    type TestMotionProjectionFrame = {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly projectionOnlyFrameWork: GpuFlowMotionProjectionFrameWorkReport | null;
      readonly rendered: boolean;
      readonly visibleProjectionState: null;
    };
    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel<
      TestContentPublicationFrame,
      TestMotionProjectionFrame
    >({
      prepareContentPublicationFrame: () => ({
        blockedPublicationCandidate: null,
        rendered: false,
        visibleProjectionState: null,
      }),
      prepareMotionProjectionFrame: () => ({
        createBlockedProjectionFrame: ({ blockedPublicationCandidate }) => ({
          blockedPublicationCandidate,
          projectionOnlyFrameWork: null,
          rendered: false,
          visibleProjectionState: null,
        }),
        hasActiveRetainedDomControl: false,
        kind: "render",
        requestedProjectionCoverageMissing: false,
        requestedProjectionFrame: retainedProjectionFrame(),
        requestedTransaction: retainedProjectionTransaction({ sample }),
        resolveHeldRetainedProjectionFrame: () => retainedProjectionFrame(),
        renderProjectionFrame: () => ({
          blockedPublicationCandidate: null,
          projectionOnlyFrameWork: projectionOnlyContentWorkReport(),
          rendered: true,
          visibleProjectionState: null,
        }),
      }),
      publish: (transaction) => {
        publishedOutcomeKind = transaction.outcome.kind;
      },
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          previousVisibleProjectionState,
          rawReasons: ["retained-scroll"],
          sample,
          viewportInteractionActive: true,
        }),
      scheduler,
    });

    expect(result.outcome.kind).toBe("blocked");
    expect(publishedOutcomeKind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected kernel blocked outcome.");
    }
    expect(result.outcome.token.frozenFrame.kind).toBe("committed");
    expect(result.outcome.token.frozenFrame).toEqual({
      frameId: previousVisibleProjectionState.committedFrame.displayFrameId,
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
    expect(result.completion.debt.motion).toBe(true);
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
  return createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId: 12,
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
  const committedFrame = committedSurfaceFrame();
  return {
    committedFrame,
    heldPreviousProjection: null,
    sample,
    transaction: {
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "motion",
      rawReasons: ["retained-scroll"],
      sample,
      startedAtMs: sample.timestamp,
    },
  } as unknown as GpuFlowVisibleProjectionState;
}

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId: 7,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

type VisibleFramePublicationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePublicationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePublicationSample({
  hasCommittedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame,
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
