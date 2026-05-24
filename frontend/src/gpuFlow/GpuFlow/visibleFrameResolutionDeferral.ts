import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";

export function shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
  committedFrame,
  deferResolutionUpdates,
  sample,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  > | null;
  readonly deferResolutionUpdates: boolean;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    deferResolutionUpdates &&
    (committedFrame === null ||
      isGpuFlowCommittedSurfaceFrameSampleCurrent({ committedFrame, sample }))
  );
}

export function shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame({
  committedFrame,
  deferResolutionUpdates,
  hasPreviousVisibleProjectionState,
  sample,
  viewportFrame,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  > | null;
  readonly deferResolutionUpdates: boolean;
  readonly hasPreviousVisibleProjectionState: boolean;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
  readonly viewportFrame: boolean;
}): boolean {
  if (
    deferResolutionUpdates &&
    viewportFrame &&
    hasPreviousVisibleProjectionState
  ) {
    return true;
  }
  return shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
    committedFrame,
    deferResolutionUpdates,
    sample,
  });
}

function isGpuFlowCommittedSurfaceFrameSampleCurrent({
  committedFrame,
  sample,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  >;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    committedFrame.coherence.retainedScrollRevision ===
      sample.retainedScrollRevision &&
    areGpuFlowProjectionViewportsEqual(
      committedFrame.viewportSample,
      sample.viewport,
    )
  );
}

function areGpuFlowProjectionViewportsEqual(
  left: GpuViewportInput,
  right: GpuViewportInput,
): boolean {
  const normalizedLeft = normalizeGpuViewport(left);
  const normalizedRight = normalizeGpuViewport(right);
  return (
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    normalizedLeft.zoom === normalizedRight.zoom
  );
}
