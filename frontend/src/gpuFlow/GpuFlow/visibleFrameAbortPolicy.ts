import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";

type GpuFlowBlockedPreparedContentFramePublicationAbort = {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly preservePreparationSnapshot: boolean;
};

export function resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
  blockedPreparedContentFrame,
  blockedPreservePreparationSnapshot,
  preparedContentFrame,
  heldPreparedContentFrame,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedPreparedContentFramePublicationAbort {
  if (blockedPreparedContentFrame) {
    return Object.freeze({
      frame: blockedPreparedContentFrame,
      preservePreparationSnapshot: blockedPreservePreparationSnapshot,
    });
  }
  if (heldPreparedContentFrame) {
    return Object.freeze({
      frame: heldPreparedContentFrame,
      preservePreparationSnapshot: true,
    });
  }
  if (preparedContentFrame && selectedVisibleProjectionState === null) {
    return Object.freeze({
      frame: preparedContentFrame,
      preservePreparationSnapshot: true,
    });
  }
  if (selectedVisibleProjectionState?.transaction.kind !== "held-previous") {
    return Object.freeze({
      frame: null,
      preservePreparationSnapshot: false,
    });
  }
  return Object.freeze({
    frame: preparedContentFrame,
    preservePreparationSnapshot: false,
  });
}
