import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFramePresentationSample,
} from "./visibleFrameCoordinator";

describe("GPU Flow visible frame outcome report", () => {
  it("blocks no-frame held-previous outcomes after the coordinator hold budget", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime({
      knobs: {
        ...DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
        maxHeldPreviousFrames: 1,
        maxHeldPreviousMs: 5,
      },
    });
    const sample = liveProjectionSample({ id: 8, timestamp: 8 });
    const rawReasons = ["retained-scroll"] as const;

    const result = runGpuFlowVisibleFrameCoordinator({
      prepareContentPreparationFrame: () =>
        noVisibleFramePresentationCandidate(),
      prepareMotionProjectionFrame: () => ({
        frame: noVisibleFramePresentationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          previousVisibleProjectionState: previousHeldVisibleProjectionState(),
          rawReasons,
          sample,
          viewportInteractionActive: true,
        }),
      reducerRuntime: scheduler,
    });

    expect(result.reducerDecision.rawReasons).toEqual(rawReasons);
    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected no-frame held-previous over budget to block.");
    }
    expect(result.outcome.token.frozenFrameId).toBe(7);
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "visible-transaction",
        reason: "no-visible-frame",
      },
    ]);
    const reducerCompletion = result.completeReducerFrame();
    expect(reducerCompletion.completion.debt.motion).toBe(true);
    expect(reducerCompletion.debtFrameRequest).toEqual({
      delayMs: 160,
      frameReason: "retained-scroll",
    });
    expect(result.followUpFrameRequests).toEqual([]);
  });

  it("returns retained follow-up frame requests from coordinator completion", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const result = runGpuFlowVisibleFrameCoordinator({
      prepareContentPreparationFrame: () =>
        noVisibleFramePresentationCandidate({
          retainedDisplayFollowUpFrameReason: "texture-upload",
        }),
      prepareMotionProjectionFrame: () => ({
        frame: noVisibleFramePresentationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          sample: liveProjectionSample({ id: 9, timestamp: 9 }),
        }),
      reducerRuntime: scheduler,
    });

    expect(result.followUpFrameRequests).toEqual(["texture-upload"]);
  });

  it("returns cold-start shell publication from coordinator completion", () => {
    const scheduler = createGpuFlowVisibleFrameReducerRuntime();
    const result = runGpuFlowVisibleFrameCoordinator({
      prepareContentPreparationFrame: () =>
        noVisibleFramePresentationCandidate(),
      prepareMotionProjectionFrame: () => ({
        frame: noVisibleFramePresentationCandidate(),
        kind: "not-rendered",
      }),
      publish: () => {},
      sampleVisibleFramePresentation: () =>
        visibleFramePresentationSample({
          hasPresentedContentFrame: false,
          sample: liveProjectionSample({ id: 10, timestamp: 10 }),
        }),
      reducerRuntime: scheduler,
    });

    expect(result.coldStartShellPublication.frame?.kind).toBe(
      "cold-start-shell",
    );
    expect(result.coldStartShellPublication.token).toBe(result.outcome.token);
  });
});

function noVisibleFramePresentationCandidate({
  retainedDisplayFollowUpFrameReason = null,
}: {
  readonly retainedDisplayFollowUpFrameReason?:
    | GpuFrameReason
    | null
    | undefined;
} = {}) {
  return {
    blockedPresentationCandidate: null,
    retainedDisplayFollowUpFrameReason,
    rendered: false,
    visibleProjectionState: null,
  };
}

function visibleFramePresentationSample({
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: Partial<Omit<GpuFlowVisibleFramePresentationSample, "sample">> & {
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePresentationSample {
  return {
    hasPresentedContentFrame: true,
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
    preparedContentFrame: { displayFrameId: 7 },
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
