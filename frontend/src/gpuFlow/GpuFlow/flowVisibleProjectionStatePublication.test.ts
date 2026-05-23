import { describe, expect, it } from "vitest";

import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowVisibleFrameHoldPreviousToken } from "./visibleFramePublicationKernel";
import {
  recordGpuFlowHeldPreviousVisibleProjectionState,
  recordGpuFlowNoFrameHeldPreviousVisibleProjectionState,
} from "./flowVisibleProjectionStatePublication";

describe("GPU Flow visible projection state publication", () => {
  it("records held-previous diagnostics without advancing committed visible projection state", () => {
    const committedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "content-publication",
      sampleId: 1,
    });
    const heldState = visibleProjectionState({
      displayFrameId: 7,
      kind: "held-previous",
      sampleId: 2,
    });
    const visibleProjectionStateRef = { current: committedState };
    const visibleProjectionPublicationStateRef = { current: committedState };

    recordGpuFlowHeldPreviousVisibleProjectionState({
      token: createGpuFlowVisibleFrameHoldPreviousToken({
        committedFrameId: 7,
        holdAgeFrames: 1,
        holdAgeMs: 16,
        projectionSample: heldState.sample,
      }),
      visibleProjectionPublicationStateRef,
      visibleProjectionState: heldState,
    });

    expect(visibleProjectionStateRef.current).toBe(committedState);
    expect(visibleProjectionPublicationStateRef.current).toBe(heldState);
  });

  it("records no-frame held-previous diagnostics for the next kernel decision", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const committedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "content-publication",
      sampleId: 1,
    });
    const sample = liveProjectionSample({ id: 2, timestamp: 16 });
    const publicationDecision = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample,
      timestamp: sample.timestamp,
      viewportInteractionActive: true,
    });
    const visibleProjectionPublicationStateRef = { current: committedState };

    recordGpuFlowNoFrameHeldPreviousVisibleProjectionState({
      previousVisibleProjectionState: committedState,
      publicationDecision,
      schedulerKnobs: DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
      token: createGpuFlowVisibleFrameHoldPreviousToken({
        committedFrameId: 7,
        holdAgeFrames: 1,
        holdAgeMs: 0,
        projectionSample: sample,
      }),
      visibleProjectionPublicationStateRef,
    });

    expect(visibleProjectionPublicationStateRef.current).not.toBe(
      committedState,
    );
    expect(visibleProjectionPublicationStateRef.current?.transaction.kind).toBe(
      "held-previous",
    );
    expect(
      visibleProjectionPublicationStateRef.current?.heldPreviousProjection
        ?.reason,
    ).toBe("no-visible-frame");
  });
});

function visibleProjectionState({
  displayFrameId,
  kind,
  sampleId,
}: {
  readonly displayFrameId: number;
  readonly kind: "content-publication" | "held-previous";
  readonly sampleId: number;
}): GpuFlowVisibleProjectionState {
  return {
    committedFrame: {
      coherence: {
        hitGenerationId: `hit:${displayFrameId}`,
      },
      displayFrameId,
    },
    debugState: {
      projectionTransactionId: `projection:${displayFrameId}:${sampleId}`,
    },
    sample: {
      id: sampleId,
      timestamp: sampleId * 16,
    },
    transaction: {
      id: `projection:${displayFrameId}:${sampleId}`,
      kind,
      lane: "content",
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
