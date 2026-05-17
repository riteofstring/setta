import {
  createGpuFlowCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";

export function createGpuFlowVisibleProjectionStateForRetainedPublication({
  committedGpuNativeVisuals,
  frameReasons,
  heldPreviousProjectionState,
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
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
  readonly retainedDisplayOutcomeKind: string;
}): GpuFlowVisibleProjectionState {
  const heldPrevious =
    retainedDisplayOutcomeKind === "hold-previous"
      ? heldPreviousProjectionState
      : null;
  const visibleCommittedFrame =
    heldPrevious?.committedFrame ??
    publishedCommittedSurfaceFrame ??
    createGpuFlowCommittedSurfaceFrame({
      gpuNativeVisuals: committedGpuNativeVisuals,
      retainedDisplayFrame: publishedRetainedFrame,
    });
  return createGpuFlowVisibleProjectionState({
    committedFrame: visibleCommittedFrame,
    transaction: createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: visibleCommittedFrame.displayFrameId,
      kind: heldPrevious ? "held-previous" : "content-publication",
      lane: publicationLane,
      rawReasons: frameReasons,
      sample: heldPrevious?.sample ?? liveProjectionSample,
    }),
  });
}
