import type { MutableRefObject } from "react";

import { type GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  assertGpuFlowCommitPublicationToken,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

export function publishGpuFlowVisibleProjectionState({
  commitPublicationToken,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly commitPublicationToken: GpuFlowCommitPublicationToken;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow committed visible projection state publication cannot publish a held-previous frame.",
    );
  }
  publishCommittedVisibleProjectionState({
    token: commitPublicationToken,
    visibleProjectionPublicationStateRef,
    visibleProjectionState,
    visibleProjectionStateRef,
  });
}

export function recordGpuFlowHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  if (visibleProjectionState.transaction.kind !== "held-previous") {
    throw new Error(
      "GPU Flow held-previous visible projection diagnostics require a held-previous frame.",
    );
  }
  recordHeldPreviousVisibleProjectionState({
    token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState,
  });
}

function publishCommittedVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowCommitPublicationToken;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  assertGpuFlowCommitPublicationToken({
    frame: visibleProjectionState.committedFrame,
    token,
  });
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  visibleProjectionStateRef.current = visibleProjectionState;
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}

function recordHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  assertGpuFlowHoldPreviousTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  if (
    token.committedFrameId !==
    visibleProjectionState.committedFrame.displayFrameId
  ) {
    throw new Error(
      "GPU Flow held-previous visible projection state publication requires a hold-previous token for the same committed frame.",
    );
  }
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}
