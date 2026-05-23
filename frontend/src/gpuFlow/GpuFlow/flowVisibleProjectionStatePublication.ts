import type { MutableRefObject } from "react";

import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
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
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
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
  readonly token: GpuFlowHoldPreviousToken | null;
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

export function recordGpuFlowNoFrameHeldPreviousVisibleProjectionState({
  previousVisibleProjectionState,
  publicationDecision,
  schedulerKnobs,
  token,
  visibleProjectionPublicationStateRef,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly token: GpuFlowHoldPreviousToken | null;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
}): void {
  if (!previousVisibleProjectionState) {
    throw new Error(
      "GPU Flow no-frame held-previous diagnostics require a previous visible projection state.",
    );
  }
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId: previousVisibleProjectionState.committedFrame.displayFrameId,
    kind: "held-previous",
    lane: resolveGpuFlowHeldPreviousPublicationLane({
      previousVisibleProjectionState,
      publicationDecision,
    }),
    rawReasons: publicationDecision.rawReasons,
    sample: publicationDecision.sample,
  });
  recordHeldPreviousVisibleProjectionState({
    token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState: createGpuFlowVisibleProjectionState({
      committedFrame: previousVisibleProjectionState.committedFrame,
      heldPreviousProjection: createGpuFlowHeldPreviousProjection({
        heldTransaction: transaction,
        knobs: schedulerKnobs,
        previousVisibleProjectionState,
        reason: "no-visible-frame",
        requestedSample: publicationDecision.sample,
      }),
      transaction,
    }),
  });
}

function resolveGpuFlowHeldPreviousPublicationLane({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowProjectionLane {
  if (publicationDecision.lane !== "idle") {
    return publicationDecision.lane;
  }
  return previousVisibleProjectionState.transaction.lane;
}

function publishCommittedVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowCommitPublicationToken | null;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
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
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}

function recordHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken | null;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
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
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}
