import type { MutableRefObject } from "react";

import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  assertGpuFlowCommitPublicationToken,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

export function publishGpuFlowVisibleProjectionState({
  commitPublicationToken,
  holdPreviousToken,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    publishHeldPreviousVisibleProjectionState({
      token: holdPreviousToken,
      visibleProjectionState,
      visibleProjectionStateRef,
    });
    return;
  }
  publishCommittedVisibleProjectionState({
    token: commitPublicationToken,
    visibleProjectionState,
    visibleProjectionStateRef,
  });
}

function publishCommittedVisibleProjectionState({
  token,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowCommitPublicationToken | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  if (!token) {
    throw new Error(
      "GPU Flow visible projection state publication requires the commit token that published the visible frame.",
    );
  }
  assertGpuFlowCommitPublicationToken({
    frame: visibleProjectionState.committedFrame,
    token,
  });
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  visibleProjectionStateRef.current = visibleProjectionState;
}

function publishHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowHoldPreviousToken | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  if (!token) {
    throw new Error(
      "GPU Flow held-previous visible projection state publication requires the hold-previous token for the selected frame.",
    );
  }
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
  visibleProjectionStateRef.current = visibleProjectionState;
}
