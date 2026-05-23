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

const GPU_FLOW_VISIBLE_FRAME_ENGINE_OUTCOME = Symbol(
  "GpuFlowVisibleFrameEngineOutcome",
);

type GpuFlowVisibleFrameEngineOutcomeBrand = {
  readonly [GPU_FLOW_VISIBLE_FRAME_ENGINE_OUTCOME]: true;
};

export type GpuFlowVisibleFrameEngineOutcomeReason = {
  readonly actorId: string | null;
  readonly family: GpuFlowVisibleFrameActorFamily | "frame";
  readonly proof: "blocked" | "compatible-previous" | "missing" | "true-hole";
  readonly reason: string;
};

export type GpuFlowVisibleFrameEngineOutcome =
  GpuFlowVisibleFrameEngineOutcomeBrand &
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
          readonly decidingProof: GpuFlowVisibleFrameEngineOutcomeReason;
          readonly heldForProjectionSampleId: GpuFlowProjectionSampleId;
          readonly kind: "held";
          readonly presentationId: GpuFlowPresentationId;
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameEngineOutcomeReason;
          readonly kind: "blocked-cold-start";
          readonly shellFrameId: "cold-start-shell";
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameEngineOutcomeReason;
          readonly kind: "aborted";
          readonly previousPresentationId: GpuFlowPresentationId;
          readonly releasedResourceIds: readonly string[];
        }
    );

type GpuFlowVisibleFrameBlockingProof = {
  readonly proof: GpuFlowVisibleFrameEngineOutcomeReason;
};

export type GpuFlowVisibleFrameEngineSample = {
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
  readonly sample: GpuFlowVisibleFrameEngineSample;
};

type GpuFlowVisibleFrameEnginePresentationOutcome = Extract<
  GpuFlowVisibleFrameEngineOutcome,
  { readonly kind: "presented" | "projected" }
>;

type GpuFlowVisibleFrameEngineAbortedOutcome = Extract<
  GpuFlowVisibleFrameEngineOutcome,
  { readonly kind: "aborted" }
>;

type GpuFlowVisibleFrameEngineHeldOutcome = Extract<
  GpuFlowVisibleFrameEngineOutcome,
  { readonly kind: "held" }
>;

type GpuFlowVisibleFrameEngineColdStartOutcome = Extract<
  GpuFlowVisibleFrameEngineOutcome,
  { readonly kind: "blocked-cold-start" }
>;

export type GpuFlowVisibleFrameEngine = {
  readonly abort: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameEngineOutcome,
  ) => void;
  readonly prepare: (
    sample: GpuFlowVisibleFrameEngineSample,
  ) => GpuFlowVisibleFramePreparedFrame;
  readonly present: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameEngineOutcome,
  ) => void;
  readonly prove: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
  ) => GpuFlowVisibleFrameEngineOutcome;
  readonly runFrame: () => GpuFlowVisibleFrameEngineOutcome;
  readonly sample: () => GpuFlowVisibleFrameEngineSample;
};

export type GpuFlowVisibleFrameEngineInput = {
  readonly abortVisibleFrameCandidate: (input: {
    readonly outcome: GpuFlowVisibleFrameEngineAbortedOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly blockColdStartVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameEngineColdStartOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly holdVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameEngineHeldOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly prepareVisibleFrameCandidate: (input: {
    readonly sample: GpuFlowVisibleFrameEngineSample;
  }) => GpuFlowVisibleFramePreparedFrame;
  readonly presentVisibleFrame: (input: {
    readonly outcome: GpuFlowVisibleFrameEnginePresentationOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly sampleVisibleFrame: () => GpuFlowVisibleFrameEngineSample;
};

export function createGpuFlowVisibleFrameEngine({
  abortVisibleFrameCandidate,
  blockColdStartVisibleFrame = () => {},
  holdVisibleFrame = () => {},
  prepareVisibleFrameCandidate,
  presentVisibleFrame,
  sampleVisibleFrame,
}: GpuFlowVisibleFrameEngineInput): GpuFlowVisibleFrameEngine {
  const engine: GpuFlowVisibleFrameEngine = Object.freeze({
    abort: (preparedFrame, outcome) => {
      const abortedOutcome = assertGpuFlowVisibleFrameEngineOutcomeKind({
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
        assertGpuFlowVisibleFrameEnginePresentationOutcome({ outcome });
      presentVisibleFrame({
        outcome: presentationOutcome,
        preparedFrame,
      });
    },
    prove: (preparedFrame) =>
      proveGpuFlowVisibleFrameEngineFrame({
        candidate: preparedFrame.candidate,
        previousPresentation: preparedFrame.previousPresentation,
      }),
    runFrame: () => {
      const sample = engine.sample();
      const preparedFrame = engine.prepare(sample);
      const outcome = engine.prove(preparedFrame);
      switch (outcome.kind) {
        case "presented":
        case "projected":
          engine.present(preparedFrame, outcome);
          break;
        case "aborted":
          engine.abort(preparedFrame, outcome);
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
    sample: () => freezeGpuFlowVisibleFrameEngineSample(sampleVisibleFrame()),
  });
  return engine;
}

export function proveGpuFlowVisibleFrameEngineFrame({
  candidate,
  previousPresentation,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation | null;
}): GpuFlowVisibleFrameEngineOutcome {
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
    return brandGpuFlowVisibleFrameEngineOutcome({
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
  return brandGpuFlowVisibleFrameEngineOutcome({
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

export function assertGpuFlowVisibleFrameEngineOutcomeBrand({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameEngineOutcome;
}): void {
  if (!hasGpuFlowVisibleFrameEngineOutcomeBrand(outcome)) {
    throw new Error("Expected GPU Flow visible frame engine outcome.");
  }
}

function assertGpuFlowVisibleFrameEnginePresentationOutcome({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameEngineOutcome;
}): GpuFlowVisibleFrameEnginePresentationOutcome {
  assertGpuFlowVisibleFrameEngineOutcomeBrand({ outcome });
  if (outcome.kind !== "presented" && outcome.kind !== "projected") {
    throw new Error(
      "GPU Flow visible frame engine present requires a presented or projected outcome.",
    );
  }
  return outcome;
}

function assertGpuFlowVisibleFrameEngineOutcomeKind<
  Kind extends GpuFlowVisibleFrameEngineOutcome["kind"],
>({
  kind,
  outcome,
}: {
  readonly kind: Kind;
  readonly outcome: GpuFlowVisibleFrameEngineOutcome;
}): Extract<GpuFlowVisibleFrameEngineOutcome, { readonly kind: Kind }> {
  assertGpuFlowVisibleFrameEngineOutcomeBrand({ outcome });
  if (outcome.kind !== kind) {
    throw new Error(
      `GPU Flow visible frame engine outcome ${outcome.kind} cannot be used as ${kind}.`,
    );
  }
  return outcome as Extract<
    GpuFlowVisibleFrameEngineOutcome,
    { readonly kind: Kind }
  >;
}

function selectGpuFlowVisibleFrameBlockingProof({
  candidate,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
}): GpuFlowVisibleFrameBlockingProof | null {
  const requiredProofs = createGpuFlowVisibleFrameRequiredProofMap(candidate);
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
  readonly reason: GpuFlowVisibleFrameEngineOutcomeReason;
}): GpuFlowVisibleFrameEngineOutcome {
  if (previousPresentation === null) {
    return brandGpuFlowVisibleFrameEngineOutcome({
      debt: candidate.queuedDebt,
      decidingProof: reason,
      kind: "blocked-cold-start",
      shellFrameId: "cold-start-shell",
    });
  }
  if (reason.reason === "held-previous-budget-exceeded") {
    return brandGpuFlowVisibleFrameEngineOutcome({
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
    return brandGpuFlowVisibleFrameEngineOutcome({
      contentFrameId: previousPresentation.contentFrameId,
      debt: candidate.queuedDebt,
      decidingProof: reason,
      heldForProjectionSampleId: candidate.projectionSampleId,
      kind: "held",
      presentationId: previousPresentation.presentationId,
    });
  }
  return brandGpuFlowVisibleFrameEngineOutcome({
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

function brandGpuFlowVisibleFrameEngineOutcome<
  Outcome extends Omit<
    GpuFlowVisibleFrameEngineOutcome,
    keyof GpuFlowVisibleFrameEngineOutcomeBrand
  >,
>(outcome: Outcome): GpuFlowVisibleFrameEngineOutcome {
  return Object.freeze({
    [GPU_FLOW_VISIBLE_FRAME_ENGINE_OUTCOME]: true as const,
    ...outcome,
  }) as unknown as GpuFlowVisibleFrameEngineOutcome;
}

function hasGpuFlowVisibleFrameEngineOutcomeBrand(
  outcome: GpuFlowVisibleFrameEngineOutcome,
): boolean {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    GPU_FLOW_VISIBLE_FRAME_ENGINE_OUTCOME in outcome
  );
}

function freezeGpuFlowVisibleFrameEngineSample(
  sample: GpuFlowVisibleFrameEngineSample,
): GpuFlowVisibleFrameEngineSample {
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
