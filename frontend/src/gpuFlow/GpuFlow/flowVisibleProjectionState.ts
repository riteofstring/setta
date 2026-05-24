import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  createGpuFlowProjectionTransactionForPreparedContentFrameId,
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
  const visiblePreparedContentFrame = getGpuFlowVisiblePreparedContentFrame({
    preparedContentFrame,
  });
  const transaction =
    createGpuFlowProjectionTransactionForPreparedContentFrameId({
      preparedContentFrameId: visiblePreparedContentFrame.displayFrameId,
      kind: "prepared-content",
      lane: contentWorkLane,
      rawReasons: frameReasons,
      sample: liveProjectionSample,
    });
  return createGpuFlowVisibleProjectionState({
    preparedContentFrame: visiblePreparedContentFrame,
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
