import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";

export function createGpuFlowVisibleProjectionStateForRetainedPublication({
  frameReasons,
  heldPreviousProjectionState,
  heldPreviousReason = "retained-display-coverage-missing",
  liveProjectionSample,
  publicationLane,
  publishedCommittedSurfaceFrame,
  retainedDisplayOutcomeKind,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly heldPreviousReason?: string | undefined;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly retainedDisplayOutcomeKind: string;
}): GpuFlowVisibleProjectionState {
  const heldPrevious = getGpuFlowHeldPreviousProjectionState({
    heldPreviousProjectionState,
    retainedDisplayOutcomeKind,
  });
  const visibleCommittedFrame = getGpuFlowVisibleCommittedSurfaceFrame({
    heldPrevious,
    publishedCommittedSurfaceFrame,
  });
  const transaction: GpuFlowProjectionTransaction =
    createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: visibleCommittedFrame.displayFrameId,
      kind: getGpuFlowProjectionTransactionKind(heldPrevious),
      lane: publicationLane,
      rawReasons: frameReasons,
      sample: liveProjectionSample,
    });
  return createGpuFlowVisibleProjectionState({
    committedFrame: visibleCommittedFrame,
    heldPreviousProjection: heldPrevious
      ? createGpuFlowHeldPreviousProjection({
          heldTransaction: transaction,
          knobs: DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
          previousVisibleProjectionState: heldPrevious,
          reason: heldPreviousReason,
          requestedSample: liveProjectionSample,
        })
      : null,
    transaction,
  });
}

function getGpuFlowHeldPreviousProjectionState({
  heldPreviousProjectionState,
  retainedDisplayOutcomeKind,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcomeKind: string;
}): GpuFlowVisibleProjectionState | null {
  if (retainedDisplayOutcomeKind !== "hold-previous") {
    return null;
  }
  return heldPreviousProjectionState;
}

function getGpuFlowVisibleCommittedSurfaceFrame({
  heldPrevious,
  publishedCommittedSurfaceFrame,
}: {
  readonly heldPrevious: GpuFlowVisibleProjectionState | null;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfaceFrame {
  if (heldPrevious) {
    return heldPrevious.committedFrame;
  }
  if (publishedCommittedSurfaceFrame) {
    return publishedCommittedSurfaceFrame;
  }
  throw new Error(
    "GPU Flow visible projection requires a prepared committed surface frame.",
  );
}

function getGpuFlowProjectionTransactionKind(
  heldPrevious: GpuFlowVisibleProjectionState | null,
): GpuFlowProjectionTransaction["kind"] {
  return heldPrevious ? "held-previous" : "content-publication";
}
