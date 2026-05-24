import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";

type GpuFlowBlockedPreparedContentFramePublicationAbort = {
  readonly frame: GpuFlowPreparedContentFrame | null;
  readonly preservePreparationSnapshot: boolean;
};

export function resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
  blockedPreparedContentFrame,
  blockedPreservePreparationSnapshot,
  preparedContentFrame,
  heldPreparedContentFrame,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
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
