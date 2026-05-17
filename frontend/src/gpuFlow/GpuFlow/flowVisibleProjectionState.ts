import {
  createGpuFlowCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
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
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";

export function createGpuFlowVisibleProjectionStateForRetainedPublication({
  committedGpuNativeVisuals,
  frameReasons,
  heldPreviousProjectionState,
  heldPreviousReason = "retained-display-coverage-missing",
  liveProjectionSample,
  publicationLane,
  publishedCommittedSurfaceFrame,
  publishedRetainedFrame,
  retainedDisplayOutcomeKind,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly heldPreviousReason?: string | undefined;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
  readonly retainedDisplayOutcomeKind: string;
}): GpuFlowVisibleProjectionState {
  const heldPrevious = getGpuFlowHeldPreviousProjectionState({
    heldPreviousProjectionState,
    retainedDisplayOutcomeKind,
  });
  const visibleCommittedFrame = getGpuFlowVisibleCommittedSurfaceFrame({
    committedGpuNativeVisuals,
    heldPrevious,
    publishedCommittedSurfaceFrame,
    publishedRetainedFrame,
  });
  const transaction: GpuFlowProjectionTransaction =
    createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: visibleCommittedFrame.displayFrameId,
      kind: getGpuFlowProjectionTransactionKind(heldPrevious),
      lane: publicationLane,
      rawReasons: frameReasons,
      sample: getGpuFlowProjectionTransactionSample({
        heldPrevious,
        liveProjectionSample,
      }),
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
  committedGpuNativeVisuals,
  heldPrevious,
  publishedCommittedSurfaceFrame,
  publishedRetainedFrame,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly heldPrevious: GpuFlowVisibleProjectionState | null;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfaceFrame {
  if (heldPrevious) {
    return heldPrevious.committedFrame;
  }
  if (publishedCommittedSurfaceFrame) {
    return publishedCommittedSurfaceFrame;
  }
  return createGpuFlowCommittedSurfaceFrame({
    gpuNativeVisuals: committedGpuNativeVisuals,
    retainedDisplayFrame: publishedRetainedFrame,
  });
}

function getGpuFlowProjectionTransactionKind(
  heldPrevious: GpuFlowVisibleProjectionState | null,
): GpuFlowProjectionTransaction["kind"] {
  return heldPrevious ? "held-previous" : "content-publication";
}

function getGpuFlowProjectionTransactionSample({
  heldPrevious,
  liveProjectionSample,
}: {
  readonly heldPrevious: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowLiveProjectionSample {
  return heldPrevious?.sample ?? liveProjectionSample;
}
