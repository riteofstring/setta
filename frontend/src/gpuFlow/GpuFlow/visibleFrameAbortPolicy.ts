import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";

type GpuFlowBlockedCommittedSurfacePublicationAbort = {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly preservePreparationSnapshot: boolean;
};

export function resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
  blockedPreparedContentFrame,
  blockedPreservePreparationSnapshot,
  committedSurfaceFrame,
  heldPreparedContentFrame,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedCommittedSurfacePublicationAbort {
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
  if (committedSurfaceFrame && selectedVisibleProjectionState === null) {
    return Object.freeze({
      frame: committedSurfaceFrame,
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
    frame: committedSurfaceFrame,
    preservePreparationSnapshot: false,
  });
}
