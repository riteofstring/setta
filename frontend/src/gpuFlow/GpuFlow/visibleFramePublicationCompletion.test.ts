import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
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
    const schedulerCompletion = result.completeSchedulerFrame();
    expect(schedulerCompletion.completion.debt.motion).toBe(true);
    expect(schedulerCompletion.debtFrameRequest).toEqual({
      delayMs: 160,
      frameReason: "retained-scroll",
    });
    expect(result.followUpFrameRequests).toEqual([]);
  });

  it("returns retained follow-up frame requests from kernel completion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel({
      prepareContentPublicationFrame: () =>
        noVisiblePublicationCandidate({
          retainedDisplayFollowUpFrameReason: "texture-upload",
        }),
      prepareMotionProjectionFrame: () => ({
        frame: noVisiblePublicationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          sample: liveProjectionSample({ id: 9, timestamp: 9 }),
        }),
      scheduler,
    });

    expect(result.followUpFrameRequests).toEqual(["texture-upload"]);
  });

  it("returns cold-start shell publication from kernel completion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const result = runGpuFlowVisibleFramePublicationCandidateSetKernel({
      prepareContentPublicationFrame: () => noVisiblePublicationCandidate(),
      prepareMotionProjectionFrame: () => ({
        frame: noVisiblePublicationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          hasCommittedContentFrame: false,
          sample: liveProjectionSample({ id: 10, timestamp: 10 }),
        }),
      scheduler,
    });

    expect(result.coldStartShellPublication.frame?.kind).toBe(
      "cold-start-shell",
    );
    expect(result.coldStartShellPublication.token).toBe(result.outcome.token);
  });
});

function noVisiblePublicationCandidate({
  retainedDisplayFollowUpFrameReason = null,
}: {
  readonly retainedDisplayFollowUpFrameReason?:
    | GpuFrameReason
    | null
    | undefined;
} = {}) {
  return {
    blockedPublicationCandidate: null,
    retainedDisplayFollowUpFrameReason,
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
