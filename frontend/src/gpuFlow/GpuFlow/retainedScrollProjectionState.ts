import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  getGpuRetainedContentRuntimeScrollRevision,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";

export function isGpuFlowVisibleProjectionStateRetainedScrollCurrent({
  retainedContentRuntimeState,
  visibleProjectionState,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  if (!visibleProjectionState) {
    return false;
  }
  return (
    visibleProjectionState.sample.retainedScrollRevision ===
      getGpuRetainedContentRuntimeScrollRevision(retainedContentRuntimeState) &&
    areGpuFlowRetainedScrollOffsetMapsEqual({
      left: visibleProjectionState.sample.retainedScrollOffsets,
      right: getGpuRetainedContentRuntimeScrollOffsets(
        retainedContentRuntimeState,
      ),
    })
  );
}

export function areGpuFlowRetainedScrollOffsetMapsEqual({
  left,
  right,
}: {
  readonly left: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly right: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
}): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [surfaceId, leftOffset] of left) {
    const rightOffset = right.get(surfaceId);
    if (
      !rightOffset ||
      rightOffset.x !== leftOffset.x ||
      rightOffset.y !== leftOffset.y
    ) {
      return false;
    }
  }
  return true;
}
