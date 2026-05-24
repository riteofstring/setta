import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { normalizeGpuViewport } from "../viewportMath";

export function createGpuFlowVisibleOverlayProjectionKey(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): string {
  const viewport = normalizeGpuViewport(visibleProjectionState.sample.viewport);
  return JSON.stringify([
    visibleProjectionState.committedFrame.displayFrameId,
    visibleProjectionState.sample.id,
    visibleProjectionState.transaction.id,
    viewport.x,
    viewport.y,
    viewport.zoom,
    visibleProjectionState.sample.retainedScrollRevision,
    createGpuFlowRetainedScrollOverlayProjectionKeyParts(
      visibleProjectionState.sample,
    ),
  ]);
}

function createGpuFlowRetainedScrollOverlayProjectionKeyParts(
  sample: GpuFlowLiveProjectionSample,
): readonly (readonly [string, number, number])[] {
  return [...sample.retainedScrollOffsets.entries()]
    .sort(([leftSurfaceId], [rightSurfaceId]) =>
      leftSurfaceId.localeCompare(rightSurfaceId),
    )
    .map(([surfaceId, offset]) => [surfaceId, offset.x, offset.y] as const);
}
