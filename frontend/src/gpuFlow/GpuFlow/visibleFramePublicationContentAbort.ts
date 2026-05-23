import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";

export type GpuFlowBlockedCommittedSurfacePublicationAbort = {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly preservePreparationSnapshot: boolean;
};

export function resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedCommittedSurfacePublicationAbort {
  if (blockedPreparedCommittedSurfaceFrame) {
    return Object.freeze({
      frame: blockedPreparedCommittedSurfaceFrame,
      preservePreparationSnapshot: blockedPreservePreparationSnapshot,
    });
  }
  if (heldPreparedCommittedSurfaceFrame) {
    return Object.freeze({
      frame: heldPreparedCommittedSurfaceFrame,
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
