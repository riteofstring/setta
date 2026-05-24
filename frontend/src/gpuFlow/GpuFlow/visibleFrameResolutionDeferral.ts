import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";

export function shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample({
  preparedContentFrame,
  deferResolutionUpdates,
  sample,
}: {
  readonly preparedContentFrame: Pick<
    GpuFlowPreparedContentFrame,
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
    (preparedContentFrame === null ||
      isGpuFlowPreparedContentFrameSampleCurrent({
        preparedContentFrame,
        sample,
      }))
  );
}

export function shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame({
  preparedContentFrame,
  deferResolutionUpdates,
  hasPreviousVisibleProjectionState,
  sample,
  viewportFrame,
}: {
  readonly preparedContentFrame: Pick<
    GpuFlowPreparedContentFrame,
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
  return shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample({
    preparedContentFrame,
    deferResolutionUpdates,
    sample,
  });
}

function isGpuFlowPreparedContentFrameSampleCurrent({
  preparedContentFrame,
  sample,
}: {
  readonly preparedContentFrame: Pick<
    GpuFlowPreparedContentFrame,
    "coherence" | "viewportSample"
  >;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    preparedContentFrame.coherence.retainedScrollRevision ===
      sample.retainedScrollRevision &&
    areGpuFlowProjectionViewportsEqual(
      preparedContentFrame.viewportSample,
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
