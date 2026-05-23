import { describe, expect, it } from "vitest";

import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  completeGpuFlowVisibleFramePublicationTransaction,
  type GpuFlowVisibleFramePublicationTransactionOracle,
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
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample,
      timestamp: sample.timestamp,
      viewportInteractionActive: true,
    });

    const result = completeGpuFlowVisibleFramePublicationTransaction({
      blockedPublicationToken: null,
      publicationDecision,
      previousVisibleProjectionState: previousHeldVisibleProjectionState(),
      scheduler,
      transactionOracle: transactionOracle(),
    });

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

function transactionOracle(): GpuFlowVisibleFramePublicationTransactionOracle {
  return {
    blockedPublicationCandidate: null,
    blockedProof: null,
    blockedSource: null,
    commitOracle: null,
    presentableCommit: null,
    renderedVisibleFrame: false,
    visibleProjectionSource: null,
    visibleProjectionState: null,
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
