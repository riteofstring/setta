import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
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
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowVisibleProjectionState {
  const visibleCommittedFrame = getGpuFlowVisiblePreparedContentFrame({
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

function getGpuFlowVisiblePreparedContentFrame({
  preparedContentFrame,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowPreparedContentFrame {
  if (preparedContentFrame) {
    return preparedContentFrame;
  }
  throw new Error(
    "GPU Flow visible projection requires a prepared content frame.",
  );
}
