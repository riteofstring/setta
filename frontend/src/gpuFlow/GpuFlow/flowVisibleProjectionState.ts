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
  publicationLane,
  publishedCommittedSurfaceFrame,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowVisibleProjectionState {
  const visibleCommittedFrame = getGpuFlowVisibleCommittedSurfaceFrame({
    publishedCommittedSurfaceFrame,
  });
  const transaction =
    createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: visibleCommittedFrame.displayFrameId,
      kind: "content-publication",
      lane: publicationLane,
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
  publishedCommittedSurfaceFrame,
}: {
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfaceFrame {
  if (publishedCommittedSurfaceFrame) {
    return publishedCommittedSurfaceFrame;
  }
  throw new Error(
    "GPU Flow visible projection requires a prepared committed surface frame.",
  );
}
