import { describe, expect, it } from "vitest";

import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";

describe("GPU Flow visible publication completion", () => {
  it("blocks no-frame held-previous outcomes after the kernel hold budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler({
      knobs: {
        ...DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
      },
    });
    const sample = liveProjectionSample({ id: 8, timestamp: 8 });
    const rawReasons = ["retained-scroll"] as const;

    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel({
      prepareContentPublicationFrame: () => noVisiblePublicationCandidate(),
      prepareMotionProjectionFrame: () => ({
        frame: noVisiblePublicationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          previousVisibleProjectionState: previousHeldVisibleProjectionState(),
          rawReasons,
          sample,
          viewportInteractionActive: true,
        }),
      scheduler,
    });

    expect(result.publicationDecision.rawReasons).toEqual(rawReasons);
    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected no-frame held-previous over budget to block.");
    }
    expect(result.outcome.token.frozenFrameId).toBe(7);
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);
    expect(result.completion.debt.motion).toBe(true);
  });
});

function noVisiblePublicationCandidate() {
  return {
    blockedPublicationCandidate: null,
    rendered: false,
    visibleProjectionState: null,
  };
}

function visibleFramePublicationSample({
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: Partial<Omit<GpuFlowVisibleFramePublicationSample, "sample">> & {
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame: true,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame: false,
    sample,
    timestamp,
    viewportInteractionActive,
  };
}

function previousHeldVisibleProjectionState(): GpuFlowVisibleProjectionState {
  return {
    committedFrame: { displayFrameId: 7 },
    heldPreviousProjection: {
      consecutiveFrameCount: 1,
      firstHeldAtMs: 0,
      maxHeldPreviousFramesExceeded: false,
      maxHeldPreviousMsExceeded: false,
    },
  } as GpuFlowVisibleProjectionState;
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return { id, timestamp } as GpuFlowLiveProjectionSample;
}
