import { describe, expect, it } from "vitest";

import { type GpuFlowVisibleProjectionState } from "../projectionRuntime";
import { recordGpuFlowHeldPreviousVisibleProjectionState } from "./flowVisibleProjectionStatePublication";
import { createGpuFlowVisibleFrameHoldPreviousTokenForTest } from "./visibleFramePublicationTestUtils";

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
      token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
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
