import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import { createGpuFlowVisibleFrameActorKeyForBlockedReason } from "./visibleFrameActorManifest";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFrameTransactionProofs";
import type { GpuFlowVisibleFrameStateMachineOutcome } from "./visibleFrameStateMachine";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

type GpuFlowVisibleFrameStateMachineDecidingProof = NonNullable<
  GpuFlowVisibleFrameStateMachineOutcome["decidingProof"]
>;

export function createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
  blockingProofs,
  previousVisibleProjectionState,
  visibleFrameStateMachineOutcome,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (
    !isGpuFlowVisibleFrameStateMachineBlockedOutcome(
      visibleFrameStateMachineOutcome,
    )
  ) {
    return null;
  }
  const decidingProof = visibleFrameStateMachineOutcome.decidingProof;
  if (
    isGpuFlowVisibleFrameStateMachineSyntheticVisibilityBlock(decidingProof)
  ) {
    return null;
  }
  const blockingProof = selectGpuFlowVisibleFramePublicationBlockingProof({
    blockingProofs,
    decidingProof,
  });
  return (
    blockingProof ??
    createGpuFlowVisibleFramePublicationActorBlockedProof({
      decidingProof,
      previousVisibleProjectionState,
    })
  );
}

function isGpuFlowVisibleFrameStateMachineBlockedOutcome(
  outcome: GpuFlowVisibleFrameStateMachineOutcome,
): boolean {
  return (
    outcome.kind === "blocked-cold-start" ||
    outcome.kind === "held" ||
    outcome.kind === "aborted"
  );
}

function createGpuFlowVisibleFramePublicationActorBlockedProof({
  decidingProof,
  previousVisibleProjectionState,
}: {
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof {
  const candidate = Object.freeze({
    blockedReasons: Object.freeze([
      Object.freeze({
        actorId: decidingProof.actorId,
        family: resolveGpuFlowVisibleFrameStateMachineBlockedFamily(
          decidingProof,
        ),
        reason: decidingProof.reason,
      }),
    ]),
    frozenFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
  return Object.freeze({
    blockedReasons: candidate.blockedReasons,
    candidate,
    frozenFrameId: candidate.frozenFrameId,
    source: resolveGpuFlowVisibleFrameStateMachineBlockedProofSource(
      decidingProof,
    ),
  });
}

function resolveGpuFlowVisibleFrameStateMachineBlockedFamily(
  decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof,
): string {
  if (decidingProof.reason === "compatible-previous-budget-exceeded") {
    return "compatible-previous";
  }
  return decidingProof.family === "frame"
    ? "visible-transaction"
    : decidingProof.family;
}

function resolveGpuFlowVisibleFrameStateMachineBlockedProofSource(
  decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof,
): GpuFlowVisiblePublicationBlockedProof["source"] {
  return decidingProof.proof === "compatible-previous" ||
    decidingProof.reason === "compatible-previous-budget-exceeded"
    ? "compatible-previous-proof"
    : "actor-proof";
}

function selectGpuFlowVisibleFramePublicationBlockingProof({
  blockingProofs,
  decidingProof,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
}): GpuFlowVisiblePublicationBlockedProof | null {
  let blockedReasonIndex = 0;
  for (const blockingProof of blockingProofs) {
    for (const reason of blockingProof.blockedReasons) {
      if (
        isGpuFlowVisibleFrameBlockingReasonForDecidingProof({
          decidingProof,
          index: blockedReasonIndex,
          reason,
        })
      ) {
        return blockingProof;
      }
      blockedReasonIndex += 1;
    }
  }
  return null;
}

function isGpuFlowVisibleFrameBlockingReasonForDecidingProof({
  decidingProof,
  index,
  reason,
}: {
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
  readonly index: number;
  readonly reason: GpuFlowVisiblePublicationBlockedProof["blockedReasons"][number];
}): boolean {
  const actor = createGpuFlowVisibleFrameActorKeyForBlockedReason({
    index,
    reason,
  });
  return (
    actor.actorId === decidingProof.actorId &&
    (actor.family === decidingProof.family ||
      reason.actorId === decidingProof.actorId) &&
    reason.reason === decidingProof.reason
  );
}

function isGpuFlowVisibleFrameStateMachineSyntheticVisibilityBlock({
  actorId,
  reason,
}: GpuFlowVisibleFrameStateMachineDecidingProof): boolean {
  return (
    actorId === "visible-frame" &&
    (reason === "held-previous" ||
      reason === "held-previous-budget-exceeded" ||
      reason === "no-visible-frame")
  );
}
