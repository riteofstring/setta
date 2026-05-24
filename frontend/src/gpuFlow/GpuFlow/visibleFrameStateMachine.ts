import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowProjectionLane } from "../projectionRuntime";
import {
  shouldSelectGpuFlowContentPriorityPublicationLane,
  shouldSelectGpuFlowMaintenancePriorityPublicationLane,
  shouldSelectGpuFlowMotionPriorityPublicationLane,
  shouldSelectGpuFlowSettledExplicitContentRepairLane,
  type GpuFlowProjectionSchedulerState,
} from "../projectionSchedulerPolicy";
import {
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
  type GpuFlowContentFrameId,
  type GpuFlowPresentationId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorFamily,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameCommittedPresentation,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

const GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME = Symbol(
  "GpuFlowVisibleFrameStateMachineOutcome",
);

export type GpuFlowVisibleFrameStarvationPolicy = {
  readonly maxConsecutiveMotionFramesBeforeContentProbe: number;
  readonly maxContentInterleaveMs: number;
  readonly maxHeldPreviousFrames: number;
  readonly maxHeldPreviousMs: number;
  readonly maxMaintenanceInterleaveMs: number;
  readonly motionSettleWindowMs: number;
};

type GpuFlowVisibleFrameHeldPreviousBudgetStatus = {
  readonly maxHeldPreviousFramesExceeded: boolean;
  readonly maxHeldPreviousMsExceeded: boolean;
};

export const DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY: GpuFlowVisibleFrameStarvationPolicy =
  Object.freeze({
    maxConsecutiveMotionFramesBeforeContentProbe: 6,
    maxContentInterleaveMs: 2,
    maxHeldPreviousFrames: 6,
    maxHeldPreviousMs: 120,
    maxMaintenanceInterleaveMs: 1,
    motionSettleWindowMs: 120,
  });

export type GpuFlowVisibleFramePublicationLane =
  | GpuFlowProjectionLane
  | "idle";

export type GpuFlowVisibleFrameLaneReductionFacts = {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly viewportInteractionActive: boolean;
};

export function reduceGpuFlowVisibleFramePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerKnobs,
  schedulerState,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly schedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFramePublicationLane {
  if (
    shouldPublishGpuFlowBootstrapContentFrame({
      hasCommittedContentFrame,
      motionDebt,
    })
  ) {
    return "content";
  }
  switch (schedulerState) {
    case "motion-active":
    case "motion-settling":
      return selectMotionPriorityVisiblePublicationLane({
        contentDebt,
        contentRetryDeferred,
        criticalContentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        rawReasons,
        schedulerKnobs,
        schedulerState,
        viewportInteractionActive,
      });
    case "content-catchup":
      return selectContentCatchupVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "maintenance-drain":
      return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
    case "maintenance-deferred":
    case "idle":
      return "idle";
  }
}

function shouldPublishGpuFlowBootstrapContentFrame({
  hasCommittedContentFrame,
  motionDebt,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
}): boolean {
  return motionDebt && !hasCommittedContentFrame;
}

function selectMotionPriorityVisiblePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerState,
  schedulerKnobs,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly schedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFramePublicationLane {
  if (
    shouldSelectGpuFlowSettledExplicitContentRepairLane({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      rawReasons,
      viewportInteractionActive,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMotionPriorityPublicationLane({
      hasCommittedContentFrame,
      motionDebt,
      motionRetryDeferred,
      schedulerState,
    })
  ) {
    return "motion";
  }
  if (
    shouldSelectGpuFlowContentPriorityPublicationLane({
      contentDebt,
      contentRetryDeferred,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMaintenancePriorityPublicationLane({
      contentRetryDeferred,
      maintenanceDebt,
    })
  ) {
    return schedulerKnobs.maxMaintenanceInterleaveMs > 0
      ? "maintenance"
      : "idle";
  }
  return "idle";
}

function selectContentCatchupVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisibleFramePublicationLane {
  if (contentDebt) {
    return "content";
  }
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
}

function selectMaintenanceDrainVisiblePublicationLane({
  maintenanceDebt,
}: {
  readonly maintenanceDebt: boolean;
}): GpuFlowVisibleFramePublicationLane {
  return maintenanceDebt ? "maintenance" : "idle";
}

type GpuFlowVisibleFrameStateMachineOutcomeBrand = {
  readonly [GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME]: true;
};

type GpuFlowVisibleFrameStateMachineOutcomeReason = {
  readonly actorId: string | null;
  readonly family: GpuFlowVisibleFrameActorFamily | "frame";
  readonly proof: "blocked" | "compatible-previous" | "missing" | "true-hole";
  readonly reason: string;
};

export type GpuFlowVisibleFrameStateMachineOutcome =
  GpuFlowVisibleFrameStateMachineOutcomeBrand &
    (
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: null;
          readonly kind: "presented";
          readonly presentationId: GpuFlowPresentationId;
          readonly projectionSampleId: GpuFlowProjectionSampleId;
        }
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: null;
          readonly kind: "projected";
          readonly presentationId: GpuFlowPresentationId;
          readonly previousPresentationId: GpuFlowPresentationId;
          readonly projectionSampleId: GpuFlowProjectionSampleId;
        }
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly heldForProjectionSampleId: GpuFlowProjectionSampleId;
          readonly kind: "held";
          readonly presentationId: GpuFlowPresentationId;
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly kind: "blocked-cold-start";
          readonly shellFrameId: "cold-start-shell";
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly kind: "aborted";
          readonly previousPresentationId: GpuFlowPresentationId;
          readonly releasedResourceIds: readonly string[];
        }
    );

type GpuFlowVisibleFrameBlockingProof = {
  readonly proof: GpuFlowVisibleFrameStateMachineOutcomeReason;
};

export type GpuFlowVisibleFrameStateMachineSample = {
  readonly activeGestureOwner: string | null;
  readonly canvasSize: {
    readonly height: number;
    readonly width: number;
  };
  readonly currentCommittedFrameId: number | string | null;
  readonly dpr: number;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly queuedDebt: GpuFlowVisibleFrameDebt;
  readonly retainedScrollOffsets: readonly {
    readonly actorId: string;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  }[];
  readonly sceneGeneration: string;
  readonly viewport: GpuFlowVisibleFrameRect;
};

export type GpuFlowVisibleFramePreparedFrame = {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation | null;
  readonly sample: GpuFlowVisibleFrameStateMachineSample;
};

type GpuFlowVisibleFrameStateMachinePresentationOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "presented" | "projected" }
>;

type GpuFlowVisibleFrameStateMachineAbortedOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "aborted" }
>;

type GpuFlowVisibleFrameStateMachineHeldOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "held" }
>;

type GpuFlowVisibleFrameStateMachineColdStartOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "blocked-cold-start" }
>;

type GpuFlowVisibleFrameStateMachine = {
  readonly abort: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameStateMachineOutcome,
  ) => void;
  readonly prepare: (
    sample: GpuFlowVisibleFrameStateMachineSample,
  ) => GpuFlowVisibleFramePreparedFrame;
  readonly present: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameStateMachineOutcome,
  ) => void;
  readonly prove: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
  ) => GpuFlowVisibleFrameStateMachineOutcome;
  readonly runFrame: () => GpuFlowVisibleFrameStateMachineOutcome;
  readonly sample: () => GpuFlowVisibleFrameStateMachineSample;
};

type GpuFlowVisibleFrameStateMachineInput = {
  readonly abortVisibleFrameCandidate: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineAbortedOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly blockColdStartVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineColdStartOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly holdVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineHeldOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly prepareVisibleFrameCandidate: (input: {
    readonly sample: GpuFlowVisibleFrameStateMachineSample;
  }) => GpuFlowVisibleFramePreparedFrame;
  readonly presentVisibleFrame: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachinePresentationOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly sampleVisibleFrame: () => GpuFlowVisibleFrameStateMachineSample;
};

export function createGpuFlowVisibleFrameStateMachine({
  abortVisibleFrameCandidate,
  blockColdStartVisibleFrame = () => {},
  holdVisibleFrame = () => {},
  prepareVisibleFrameCandidate,
  presentVisibleFrame,
  sampleVisibleFrame,
}: GpuFlowVisibleFrameStateMachineInput): GpuFlowVisibleFrameStateMachine {
  const stateMachine: GpuFlowVisibleFrameStateMachine = Object.freeze({
    abort: (preparedFrame, outcome) => {
      const abortedOutcome = assertGpuFlowVisibleFrameStateMachineOutcomeKind({
        kind: "aborted",
        outcome,
      });
      abortVisibleFrameCandidate({
        outcome: abortedOutcome,
        preparedFrame,
      });
    },
    prepare: (sample) =>
      Object.freeze(
        prepareVisibleFrameCandidate({
          sample,
        }),
      ),
    present: (preparedFrame, outcome) => {
      const presentationOutcome =
        assertGpuFlowVisibleFrameStateMachinePresentationOutcome({ outcome });
      presentVisibleFrame({
        outcome: presentationOutcome,
        preparedFrame,
      });
    },
    prove: (preparedFrame) =>
      proveGpuFlowVisibleFrameStateMachineFrame({
        candidate: preparedFrame.candidate,
        previousPresentation: preparedFrame.previousPresentation,
      }),
    runFrame: () => {
      const sample = stateMachine.sample();
      const preparedFrame = stateMachine.prepare(sample);
      const outcome = stateMachine.prove(preparedFrame);
      switch (outcome.kind) {
        case "presented":
        case "projected":
          stateMachine.present(preparedFrame, outcome);
          break;
        case "aborted":
          stateMachine.abort(preparedFrame, outcome);
          break;
        case "blocked-cold-start":
          blockColdStartVisibleFrame({
            outcome,
            preparedFrame,
          });
          break;
        case "held":
          holdVisibleFrame({
            outcome,
            preparedFrame,
          });
          break;
      }
      return outcome;
    },
    sample: () =>
      freezeGpuFlowVisibleFrameStateMachineSample(sampleVisibleFrame()),
  });
  return stateMachine;
}

export function createGpuFlowVisibleFrameStarvationPolicy(
  policy: GpuFlowVisibleFrameStarvationPolicy = DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
): GpuFlowVisibleFrameStarvationPolicy {
  assertGpuFlowVisibleFrameStarvationPolicy(policy);
  return Object.freeze({ ...policy });
}

export function getGpuFlowVisibleFrameHeldPreviousBudgetStatus({
  consecutiveFrameCount,
  heldDurationMs,
  policy,
}: {
  readonly consecutiveFrameCount: number;
  readonly heldDurationMs: number;
  readonly policy: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFrameHeldPreviousBudgetStatus {
  const starvationPolicy = createGpuFlowVisibleFrameStarvationPolicy(policy);
  return Object.freeze({
    maxHeldPreviousFramesExceeded:
      consecutiveFrameCount > starvationPolicy.maxHeldPreviousFrames,
    maxHeldPreviousMsExceeded:
      heldDurationMs > starvationPolicy.maxHeldPreviousMs,
  });
}

export function proveGpuFlowVisibleFrameStateMachineFrame({
  candidate,
  previousPresentation,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation | null;
}): GpuFlowVisibleFrameStateMachineOutcome {
  const blockingProof = selectGpuFlowVisibleFrameBlockingProof({
    candidate,
  });
  if (blockingProof !== null) {
    return createGpuFlowVisibleFrameBlockedOutcome({
      candidate,
      previousPresentation,
      reason: blockingProof.proof,
    });
  }
  if (
    previousPresentation !== null &&
    previousPresentation.contentFrameId === candidate.contentFrameId
  ) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      contentFrameId: candidate.contentFrameId,
      debt: candidate.queuedDebt,
      decidingProof: null,
      kind: "projected",
      presentationId: createGpuFlowVisibleFramePresentationId({
        candidate,
        kind: "projected",
      }),
      previousPresentationId: previousPresentation.presentationId,
      projectionSampleId: candidate.projectionSampleId,
    });
  }
  return brandGpuFlowVisibleFrameStateMachineOutcome({
    contentFrameId: candidate.contentFrameId,
    debt: candidate.queuedDebt,
    decidingProof: null,
    kind: "presented",
    presentationId: createGpuFlowVisibleFramePresentationId({
      candidate,
      kind: "presented",
    }),
    projectionSampleId: candidate.projectionSampleId,
  });
}

export function assertGpuFlowVisibleFrameStateMachineOutcomeBrand({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): void {
  if (!hasGpuFlowVisibleFrameStateMachineOutcomeBrand(outcome)) {
    throw new Error("Expected GPU Flow visible frame state machine outcome.");
  }
}

function assertGpuFlowVisibleFrameStateMachinePresentationOutcome({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisibleFrameStateMachinePresentationOutcome {
  assertGpuFlowVisibleFrameStateMachineOutcomeBrand({ outcome });
  if (outcome.kind !== "presented" && outcome.kind !== "projected") {
    throw new Error(
      "GPU Flow visible frame state machine present requires a presented or projected outcome.",
    );
  }
  return outcome;
}

function assertGpuFlowVisibleFrameStateMachineOutcomeKind<
  Kind extends GpuFlowVisibleFrameStateMachineOutcome["kind"],
>({
  kind,
  outcome,
}: {
  readonly kind: Kind;
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): Extract<GpuFlowVisibleFrameStateMachineOutcome, { readonly kind: Kind }> {
  assertGpuFlowVisibleFrameStateMachineOutcomeBrand({ outcome });
  if (outcome.kind !== kind) {
    throw new Error(
      `GPU Flow visible frame state machine outcome ${outcome.kind} cannot be used as ${kind}.`,
    );
  }
  return outcome as Extract<
    GpuFlowVisibleFrameStateMachineOutcome,
    { readonly kind: Kind }
  >;
}

function selectGpuFlowVisibleFrameBlockingProof({
  candidate,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
}): GpuFlowVisibleFrameBlockingProof | null {
  const requiredProofs = createGpuFlowVisibleFrameRequiredProofMap(candidate);
  return (
    selectGpuFlowVisibleFrameMissingOrTrueHoleProof({
      candidate,
      requiredProofs,
    }) ??
    selectGpuFlowVisibleFrameIncompatiblePreviousProof({
      candidate,
      requiredProofs,
    }) ??
    selectGpuFlowVisibleFrameBlockedRequiredProof({
      candidate,
      requiredProofs,
    })
  );
}

function selectGpuFlowVisibleFrameMissingOrTrueHoleProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (!proof) {
      return {
        proof: {
          actorId: actor.actorId,
          family: actor.family,
          proof: "missing",
          reason: "missing-required-proof",
        },
      };
    }
    if (proof.proof === "true-hole") {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: proof.proof,
          reason: proof.reason,
        },
      };
    }
  }
  return null;
}

function selectGpuFlowVisibleFrameIncompatiblePreviousProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (!proof) {
      continue;
    }
    if (
      proof.proof === "compatible-previous" &&
      !isGpuFlowCompatiblePreviousProofForCandidate({
        candidate,
        proof,
      })
    ) {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: "compatible-previous",
          reason: "incompatible-candidate-identity",
        },
      };
    }
  }
  return null;
}

function selectGpuFlowVisibleFrameBlockedRequiredProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (proof?.proof === "blocked") {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: proof.proof,
          reason: proof.reason,
        },
      };
    }
  }
  return null;
}

function createGpuFlowVisibleFrameBlockedOutcome({
  candidate,
  previousPresentation,
  reason,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation | null;
  readonly reason: GpuFlowVisibleFrameStateMachineOutcomeReason;
}): GpuFlowVisibleFrameStateMachineOutcome {
  if (previousPresentation === null) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      debt: candidate.queuedDebt,
      decidingProof: reason,
      kind: "blocked-cold-start",
      shellFrameId: "cold-start-shell",
    });
  }
  if (reason.reason === "held-previous-budget-exceeded") {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      debt: candidate.queuedDebt,
      decidingProof: reason,
      kind: "aborted",
      previousPresentationId: previousPresentation.presentationId,
      releasedResourceIds: candidate.preparedResourceIds,
    });
  }
  if (
    doesGpuFlowPreviousPresentationCoverRequiredActors({
      candidate,
      previousPresentation,
    })
  ) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      contentFrameId: previousPresentation.contentFrameId,
      debt: candidate.queuedDebt,
      decidingProof: reason,
      heldForProjectionSampleId: candidate.projectionSampleId,
      kind: "held",
      presentationId: previousPresentation.presentationId,
    });
  }
  return brandGpuFlowVisibleFrameStateMachineOutcome({
    debt: candidate.queuedDebt,
    decidingProof: reason,
    kind: "aborted",
    previousPresentationId: previousPresentation.presentationId,
    releasedResourceIds: candidate.preparedResourceIds,
  });
}

function createGpuFlowVisibleFrameRequiredProofMap(
  candidate: GpuFlowVisibleFrameCandidate,
): ReadonlyMap<string, GpuFlowVisibleFrameActorProof> {
  const proofByActor = new Map<string, GpuFlowVisibleFrameActorProof>();
  for (const proof of candidate.actorProofs) {
    if (proof.requirement !== "required") {
      continue;
    }
    const key = createGpuFlowVisibleFrameActorKey(proof);
    if (proofByActor.has(key)) {
      throw new Error(
        `GPU Flow visible frame candidate has duplicate required actor proofs for ${key}.`,
      );
    }
    proofByActor.set(key, proof);
  }
  return proofByActor;
}

function isGpuFlowCompatiblePreviousProofForCandidate({
  candidate,
  proof,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly proof: Extract<
    GpuFlowVisibleFrameActorProof,
    { readonly proof: "compatible-previous" }
  >;
}): boolean {
  const compatiblePreviousProof = proof.compatiblePreviousProof.proof;
  return (
    proof.compatiblePreviousProof.family === proof.family &&
    compatiblePreviousProof.candidateContentFrameId ===
      candidate.contentFrameId &&
    compatiblePreviousProof.candidateProjectionSampleId ===
      candidate.projectionSampleId
  );
}

function doesGpuFlowPreviousPresentationCoverRequiredActors({
  candidate,
  previousPresentation,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation;
}): boolean {
  const coverageByActor = new Map(
    previousPresentation.actorCoverages.map((coverage) => [
      createGpuFlowVisibleFrameActorKey(coverage),
      coverage,
    ]),
  );
  return candidate.requiredActors.every((actor) =>
    doesGpuFlowPreviousCoverageCoverCandidate({
      candidateContentFrameId: candidate.contentFrameId,
      coverage: coverageByActor.get(createGpuFlowVisibleFrameActorKey(actor)),
    }),
  );
}

function doesGpuFlowPreviousCoverageCoverCandidate({
  candidateContentFrameId,
  coverage,
}: {
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly coverage: GpuFlowVisibleFrameCommittedActorCoverage | undefined;
}): boolean {
  if (!coverage?.coversCandidateProjection) {
    return false;
  }
  return (
    coverage.contentFrameId === candidateContentFrameId ||
    coverage.compatibleContentFrameIds.includes(candidateContentFrameId)
  );
}

function createGpuFlowVisibleFramePresentationId({
  candidate,
  kind,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly kind: "presented" | "projected";
}): GpuFlowPresentationId {
  return createGpuFlowPresentationId(
    `${candidate.contentFrameId}:${candidate.projectionSampleId}:${kind}`,
  );
}

function brandGpuFlowVisibleFrameStateMachineOutcome<
  Outcome extends Omit<
    GpuFlowVisibleFrameStateMachineOutcome,
    keyof GpuFlowVisibleFrameStateMachineOutcomeBrand
  >,
>(outcome: Outcome): GpuFlowVisibleFrameStateMachineOutcome {
  return Object.freeze({
    [GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME]: true as const,
    ...outcome,
  }) as unknown as GpuFlowVisibleFrameStateMachineOutcome;
}

function hasGpuFlowVisibleFrameStateMachineOutcomeBrand(
  outcome: GpuFlowVisibleFrameStateMachineOutcome,
): boolean {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME in outcome
  );
}

function assertGpuFlowVisibleFrameStarvationPolicy(
  policy: GpuFlowVisibleFrameStarvationPolicy,
): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `GPU Flow visible frame starvation policy ${name} must be finite and non-negative.`,
      );
    }
  }
}

function freezeGpuFlowVisibleFrameStateMachineSample(
  sample: GpuFlowVisibleFrameStateMachineSample,
): GpuFlowVisibleFrameStateMachineSample {
  return Object.freeze({
    ...sample,
    canvasSize: Object.freeze({ ...sample.canvasSize }),
    queuedDebt: Object.freeze({ ...sample.queuedDebt }),
    retainedScrollOffsets: Object.freeze(
      sample.retainedScrollOffsets.map((offset) =>
        Object.freeze({ ...offset }),
      ),
    ),
    viewport: Object.freeze({ ...sample.viewport }),
  });
}
