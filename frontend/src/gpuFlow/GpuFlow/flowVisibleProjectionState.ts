import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";

export function createGpuFlowVisibleProjectionStateForRetainedPublication({
  frameReasons,
  liveProjectionSample,
  contentWorkLane,
  preparedContentFrame,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowVisibleProjectionState {
  const visibleCommittedFrame = getGpuFlowVisibleCommittedSurfaceFrame({
    preparedContentFrame,
  });
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId: visibleCommittedFrame.displayFrameId,
    kind: "content-publication",
    lane: contentWorkLane,
    rawReasons: frameReasons,
    sample: liveProjectionSample,
  });
  return createGpuFlowVisibleProjectionState({
    committedFrame: visibleCommittedFrame,
    heldPreviousProjection: null,
    transaction,
  });
}

function getGpuFlowVisibleCommittedSurfaceFrame({
  preparedContentFrame,
}: {
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfaceFrame {
  if (preparedContentFrame) {
    return preparedContentFrame;
  }
  throw new Error(
    "GPU Flow visible projection requires a prepared content frame.",
  );
}
