import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import { createGpuFlowVisibleFrameActorKeyForBlockedReason } from "./visibleFrameActorManifest";
import { createGpuFlowFrozenPreviousSafeBlockedReasons } from "./visibleFrameBlockedCandidate";
import type { GpuFlowVisibleFrameStateMachineOutcome } from "./visibleFrameStateMachine";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  type GpuFlowVisibleFrameCandidate,
} from "./visibleFrameTypes";

type GpuFlowVisibleFrameStateMachineDecidingProof = NonNullable<
  GpuFlowVisibleFrameStateMachineOutcome["decidingProof"]
>;
type GpuFlowVisibleFramePublicationBlockedReason =
  GpuFlowVisiblePublicationBlockedProof["blockedReasons"][number];

export function createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
  blockingProofs,
  candidate,
  previousVisibleProjectionState,
  visibleFrameStateMachineOutcome,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidate: GpuFlowVisibleFrameCandidate;
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
  if (!decidingProof) {
    return null;
  }
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
    createGpuFlowFrozenPreviousSafeBlockedProof({
      previousVisibleProjectionState,
      proof: blockingProof,
    }) ??
    createGpuFlowVisibleFramePublicationCandidateActorBlockedProof({
      candidate,
      decidingProof,
      previousVisibleProjectionState,
    }) ??
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

function createGpuFlowVisibleFramePublicationCandidateActorBlockedProof({
  candidate,
  decidingProof,
  previousVisibleProjectionState,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (decidingProof.proof !== "blocked") {
    return null;
  }
  const blockedReasons = Object.freeze(
    candidate.actorProofs.reduce<GpuFlowVisibleFramePublicationBlockedReason[]>(
      (reasons, proof) => {
        if (proof.requirement !== "required" || proof.proof !== "blocked") {
          return reasons;
        }
        reasons.push(
          Object.freeze({
            actorId: proof.actorId,
            family: proof.family,
            reason: proof.reason,
          }),
        );
        return reasons;
      },
      [],
    ),
  );
  if (
    blockedReasons.length === 0 ||
    !blockedReasons.some((reason) =>
      isGpuFlowVisibleFrameCandidateBlockedReasonForDecidingProof({
        decidingProof,
        reason,
      }),
    )
  ) {
    return null;
  }
  const visibleBlockedReasons = createGpuFlowFrozenPreviousSafeBlockedReasons({
    blockedReasons,
    previousVisibleProjectionState,
  });
  const blockedCandidate = Object.freeze({
    blockedReasons: visibleBlockedReasons,
    frozenFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
  return Object.freeze({
    blockedReasons: blockedCandidate.blockedReasons,
    candidate: blockedCandidate,
    frozenFrameId: blockedCandidate.frozenFrameId,
    source: "actor-proof",
  });
}

function createGpuFlowVisibleFramePublicationActorBlockedProof({
  decidingProof,
  previousVisibleProjectionState,
}: {
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof {
  const blockedReasons = createGpuFlowFrozenPreviousSafeBlockedReasons({
    blockedReasons: Object.freeze([
      Object.freeze({
        actorId: decidingProof.actorId,
        family:
          resolveGpuFlowVisibleFrameStateMachineBlockedFamily(decidingProof),
        reason: decidingProof.reason,
      }),
    ]),
    previousVisibleProjectionState,
  });
  const candidate = Object.freeze({
    blockedReasons,
    frozenFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
  return Object.freeze({
    blockedReasons: candidate.blockedReasons,
    candidate,
    frozenFrameId: candidate.frozenFrameId,
    source:
      resolveGpuFlowVisibleFrameStateMachineBlockedProofSource(decidingProof),
  });
}

function createGpuFlowFrozenPreviousSafeBlockedProof({
  previousVisibleProjectionState,
  proof,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly proof: GpuFlowVisiblePublicationBlockedProof | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (proof === null) {
    return null;
  }
  const blockedReasons = createGpuFlowFrozenPreviousSafeBlockedReasons({
    blockedReasons: proof.blockedReasons,
    previousVisibleProjectionState,
  });
  if (blockedReasons === proof.blockedReasons) {
    return proof;
  }
  const candidate = Object.freeze({
    ...proof.candidate,
    blockedReasons,
  });
  return Object.freeze({
    ...proof,
    blockedReasons,
    candidate,
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

function isGpuFlowVisibleFrameCandidateBlockedReasonForDecidingProof({
  decidingProof,
  reason,
}: {
  readonly decidingProof: GpuFlowVisibleFrameStateMachineDecidingProof;
  readonly reason: GpuFlowVisibleFramePublicationBlockedReason;
}): boolean {
  return (
    reason.actorId === decidingProof.actorId &&
    reason.family === decidingProof.family &&
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
