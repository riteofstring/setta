import { describe, expect, it } from "vitest";

import {
  assertGpuFlowVisibleFrameEngineOutcomeBrand,
  createGpuFlowVisibleFrameEngine,
  proveGpuFlowVisibleFrameEngineFrame,
  type GpuFlowVisibleFrameEngineOutcome,
  type GpuFlowVisibleFrameEngineSample,
  type GpuFlowVisibleFramePreparedFrame,
} from "./visibleFrameEngine";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  type GpuFlowContentFrameId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameCommittedPresentation,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

const ACTOR_A = {
  actorId: "actor-a",
  family: "browser-visual",
} as const satisfies GpuFlowVisibleFrameActorKey;
const ACTOR_B = {
  actorId: "actor-b",
  family: "retained-page",
} as const satisfies GpuFlowVisibleFrameActorKey;
const EMPTY_DEBT = Object.freeze({
  browserVisual: false,
  content: false,
  maintenance: false,
  motion: false,
} satisfies GpuFlowVisibleFrameDebt);

describe("GPU Flow visible frame engine reducer", () => {
  it("lets true-hole required proofs win over exact, compatible, and blocked proofs", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const previousPresentation = committedPresentation({
      contentFrameId,
      coverages: [
        coverage({ actor: ACTOR_A, contentFrameId }),
        coverage({ actor: ACTOR_B, contentFrameId }),
      ],
    });

    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [
          trueHoleProof(ACTOR_A, "retained-page-hole"),
          blockedProof(ACTOR_B, "snapshot-pending"),
          exactProof({
            actor: {
              actorId: "actor-c",
              family: "hit-debug",
            },
          }),
          compatibleBrowserProof({
            actor: {
              actorId: "actor-d",
              family: "browser-visual",
            },
            contentFrameId,
            previousPresentation,
          }),
        ],
        contentFrameId,
        requiredActors: [ACTOR_A, ACTOR_B],
      }),
      previousPresentation,
    });

    expect(outcome.kind).toBe("held");
    expect(outcome.decidingProof).toEqual({
      actorId: ACTOR_A.actorId,
      family: ACTOR_A.family,
      proof: "true-hole",
      reason: "retained-page-hole",
    });
  });

  it("blocks cold start instead of publishing partial current-scene content", () => {
    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [blockedProof(ACTOR_A, "coverage-missing")],
        requiredActors: [ACTOR_A],
      }),
      previousPresentation: null,
    });

    expect(outcome.kind).toBe("blocked-cold-start");
    expect(outcome.decidingProof).toMatchObject({
      actorId: ACTOR_A.actorId,
      proof: "blocked",
      reason: "coverage-missing",
    });
  });

  it("projects motion by advancing PresentationId without advancing ContentFrameId", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const previousPresentation = committedPresentation({
      contentFrameId,
      presentationId: createGpuFlowPresentationId("presentation-a"),
    });

    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [exactProof({ actor: ACTOR_A })],
        contentFrameId,
        projectionSampleId: "sample-2",
        requiredActors: [ACTOR_A],
      }),
      previousPresentation,
    });

    const projectedOutcome = expectOutcomeKind(outcome, "projected");
    expect(projectedOutcome.contentFrameId).toBe(
      previousPresentation.contentFrameId,
    );
    expect(projectedOutcome.presentationId).not.toBe(
      previousPresentation.presentationId,
    );
    expect(projectedOutcome.previousPresentationId).toBe(
      previousPresentation.presentationId,
    );
  });

  it("presents content publication by advancing both content and presentation identities", () => {
    const previousPresentation = committedPresentation({
      contentFrameId: createGpuFlowContentFrameId("content-a"),
      presentationId: createGpuFlowPresentationId("presentation-a"),
    });
    const nextContentFrameId = createGpuFlowContentFrameId("content-b");

    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [exactProof({ actor: ACTOR_A })],
        contentFrameId: nextContentFrameId,
        projectionSampleId: "sample-2",
        requiredActors: [ACTOR_A],
      }),
      previousPresentation,
    });

    const presentedOutcome = expectOutcomeKind(outcome, "presented");
    expect(presentedOutcome.contentFrameId).toBe(nextContentFrameId);
    expect(presentedOutcome.contentFrameId).not.toBe(
      previousPresentation.contentFrameId,
    );
    expect(presentedOutcome.presentationId).not.toBe(
      previousPresentation.presentationId,
    );
  });

  it("preserves debt for blocked required actors and holds only with complete previous coverage", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const queuedDebt = {
      ...EMPTY_DEBT,
      browserVisual: true,
      content: true,
    };
    const completePreviousPresentation = committedPresentation({
      contentFrameId,
      coverages: [coverage({ actor: ACTOR_A, contentFrameId })],
    });

    const heldOutcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [blockedProof(ACTOR_A, "snapshot-pending")],
        contentFrameId,
        queuedDebt,
        requiredActors: [ACTOR_A],
      }),
      previousPresentation: completePreviousPresentation,
    });
    const abortedOutcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [blockedProof(ACTOR_A, "snapshot-pending")],
        contentFrameId,
        preparedResourceIds: ["candidate-resource-a"],
        queuedDebt,
        requiredActors: [ACTOR_A],
      }),
      previousPresentation: committedPresentation({
        contentFrameId,
        coverages: [],
      }),
    });

    const heldFrameOutcome = expectOutcomeKind(heldOutcome, "held");
    const abortedFrameOutcome = expectOutcomeKind(abortedOutcome, "aborted");
    expect(heldFrameOutcome.debt).toEqual(queuedDebt);
    expect(abortedFrameOutcome.releasedResourceIds).toEqual([
      "candidate-resource-a",
    ]);
  });

  it("keeps maintenance proof debt queued without blocking coherent presentation", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const previousPresentation = committedPresentation({
      contentFrameId,
    });

    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [
          exactProof({ actor: ACTOR_A }),
          {
            ...ACTOR_B,
            proof: "blocked",
            reason: "maintenance-refresh",
            requirement: "maintenance",
          },
        ],
        contentFrameId,
        queuedDebt: {
          ...EMPTY_DEBT,
          maintenance: true,
        },
        requiredActors: [ACTOR_A],
      }),
      previousPresentation,
    });

    expect(outcome.kind).toBe("projected");
    expect(outcome.debt).toEqual({
      ...EMPTY_DEBT,
      maintenance: true,
    });
  });

  it("rejects compatible-previous proofs that are not tied to the candidate identities", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const previousPresentation = committedPresentation({
      contentFrameId,
      coverages: [coverage({ actor: ACTOR_A, contentFrameId })],
    });

    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [
          compatibleBrowserProof({
            actor: ACTOR_A,
            contentFrameId,
            previousPresentation,
            projectionSampleId: "stale-sample",
          }),
        ],
        contentFrameId,
        projectionSampleId: "candidate-sample",
        requiredActors: [ACTOR_A],
      }),
      previousPresentation,
    });

    expect(outcome.kind).toBe("held");
    expect(outcome.decidingProof).toEqual({
      actorId: ACTOR_A.actorId,
      family: ACTOR_A.family,
      proof: "compatible-previous",
      reason: "incompatible-candidate-identity",
    });
  });

  it("brands final outcomes so actor adapters cannot construct them directly", () => {
    const outcome = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [exactProof({ actor: ACTOR_A })],
        requiredActors: [ACTOR_A],
      }),
      previousPresentation: null,
    });

    expect(() =>
      assertGpuFlowVisibleFrameEngineOutcomeBrand({ outcome }),
    ).not.toThrow();
    expect(() =>
      assertGpuFlowVisibleFrameEngineOutcomeBrand({
        outcome: {
          kind: "presented",
        } as GpuFlowVisibleFrameEngineOutcome,
      }),
    ).toThrow(/visible frame engine outcome/);
  });
});

describe("GPU Flow visible frame engine lifecycle", () => {
  it("samples immutably, prepares a candidate, proves it, then presents only a branded complete outcome", () => {
    const order: string[] = [];
    const mutableSample = engineSample();
    let presented: {
      readonly outcome: GpuFlowVisibleFrameEngineOutcome;
      readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
    } | null = null;
    const engine = createGpuFlowVisibleFrameEngine({
      abortVisibleFrameCandidate: () => {
        order.push("abort");
      },
      prepareVisibleFrameCandidate: ({ sample }) => {
        order.push(`prepare:${Object.isFrozen(sample)}`);
        expect(sample).not.toBe(mutableSample);
        return preparedFrame({
          candidate: candidate({
            actorProofs: [exactProof({ actor: ACTOR_A })],
            projectionSampleId: sample.projectionSampleId,
            requiredActors: [ACTOR_A],
          }),
          sample,
        });
      },
      presentVisibleFrame: (input) => {
        order.push(`present:${input.outcome.kind}`);
        presented = input;
      },
      sampleVisibleFrame: () => {
        order.push("sample");
        return mutableSample;
      },
    });

    const outcome = engine.runFrame();

    expect(outcome.kind).toBe("presented");
    expect(order).toEqual(["sample", "prepare:true", "present:presented"]);
    expect(presented?.outcome).toBe(outcome);
    expect(Object.isFrozen(presented?.preparedFrame)).toBe(true);
    expect(Object.isFrozen(mutableSample)).toBe(false);
  });

  it("holds the previous coherent frame without running the present or abort callbacks", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const calls: string[] = [];
    const engine = createGpuFlowVisibleFrameEngine({
      abortVisibleFrameCandidate: () => calls.push("abort"),
      holdVisibleFrame: ({ outcome }) => calls.push(`hold:${outcome.kind}`),
      prepareVisibleFrameCandidate: ({ sample }) =>
        preparedFrame({
          candidate: candidate({
            actorProofs: [blockedProof(ACTOR_A, "snapshot-pending")],
            contentFrameId,
            projectionSampleId: sample.projectionSampleId,
            requiredActors: [ACTOR_A],
          }),
          previousPresentation: committedPresentation({
            contentFrameId,
            coverages: [coverage({ actor: ACTOR_A, contentFrameId })],
          }),
          sample,
        }),
      presentVisibleFrame: () => calls.push("present"),
      sampleVisibleFrame: () => engineSample(),
    });

    const outcome = engine.runFrame();

    expect(outcome.kind).toBe("held");
    expect(calls).toEqual(["hold:held"]);
  });

  it("aborts candidate resources without running the present callback when previous coverage is incomplete", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    let releasedResourceIds: readonly string[] | null = null;
    const engine = createGpuFlowVisibleFrameEngine({
      abortVisibleFrameCandidate: ({ outcome }) => {
        releasedResourceIds = outcome.releasedResourceIds;
      },
      prepareVisibleFrameCandidate: ({ sample }) =>
        preparedFrame({
          candidate: candidate({
            actorProofs: [blockedProof(ACTOR_A, "snapshot-pending")],
            contentFrameId,
            preparedResourceIds: ["candidate-resource-a"],
            projectionSampleId: sample.projectionSampleId,
            requiredActors: [ACTOR_A],
          }),
          previousPresentation: committedPresentation({
            contentFrameId,
            coverages: [],
          }),
          sample,
        }),
      presentVisibleFrame: () => {
        throw new Error("present callback should not run for aborted frames");
      },
      sampleVisibleFrame: () => engineSample(),
    });

    const outcome = engine.runFrame();

    expect(outcome.kind).toBe("aborted");
    expect(releasedResourceIds).toEqual(["candidate-resource-a"]);
  });

  it("routes cold-start blocks to the deliberate shell callback without presenting partial content", () => {
    const calls: string[] = [];
    const engine = createGpuFlowVisibleFrameEngine({
      abortVisibleFrameCandidate: () => calls.push("abort"),
      blockColdStartVisibleFrame: ({ outcome }) =>
        calls.push(`cold-start:${outcome.shellFrameId}`),
      prepareVisibleFrameCandidate: ({ sample }) =>
        preparedFrame({
          candidate: candidate({
            actorProofs: [blockedProof(ACTOR_A, "coverage-missing")],
            projectionSampleId: sample.projectionSampleId,
            requiredActors: [ACTOR_A],
          }),
          sample,
        }),
      presentVisibleFrame: () => calls.push("present"),
      sampleVisibleFrame: () => engineSample(),
    });

    const outcome = engine.runFrame();

    expect(outcome.kind).toBe("blocked-cold-start");
    expect(calls).toEqual(["cold-start:cold-start-shell"]);
  });

  it("rejects unbranded or wrong-kind outcomes at presentation and abort boundaries", () => {
    const contentFrameId = createGpuFlowContentFrameId("content-a");
    const prepared = preparedFrame({
      candidate: candidate({
        actorProofs: [exactProof({ actor: ACTOR_A })],
        contentFrameId,
        requiredActors: [ACTOR_A],
      }),
      sample: engineSample(),
    });
    const engine = createGpuFlowVisibleFrameEngine({
      abortVisibleFrameCandidate: () => {},
      prepareVisibleFrameCandidate: () => prepared,
      presentVisibleFrame: () => {},
      sampleVisibleFrame: () => engineSample(),
    });
    const presented = engine.prove(prepared);
    const held = proveGpuFlowVisibleFrameEngineFrame({
      candidate: candidate({
        actorProofs: [blockedProof(ACTOR_A, "snapshot-pending")],
        contentFrameId,
        requiredActors: [ACTOR_A],
      }),
      previousPresentation: committedPresentation({
        contentFrameId,
        coverages: [coverage({ actor: ACTOR_A, contentFrameId })],
      }),
    });

    expect(() =>
      engine.present(prepared, {
        kind: "presented",
      } as GpuFlowVisibleFrameEngineOutcome),
    ).toThrow(/visible frame engine outcome/);
    expect(() => engine.present(prepared, held)).toThrow(
      /present requires a presented or projected outcome/,
    );
    expect(() => engine.abort(prepared, presented)).toThrow(
      /cannot be used as aborted/,
    );
  });
});

function candidate({
  actorProofs,
  contentFrameId = createGpuFlowContentFrameId("content-a"),
  preparedResourceIds = [],
  projectionSampleId = "sample-1",
  queuedDebt = EMPTY_DEBT,
  requiredActors,
}: {
  readonly actorProofs: readonly GpuFlowVisibleFrameActorProof[];
  readonly contentFrameId?: GpuFlowContentFrameId | undefined;
  readonly preparedResourceIds?: readonly string[] | undefined;
  readonly projectionSampleId?: GpuFlowProjectionSampleId | undefined;
  readonly queuedDebt?: GpuFlowVisibleFrameDebt | undefined;
  readonly requiredActors: readonly GpuFlowVisibleFrameActorKey[];
}): GpuFlowVisibleFrameCandidate {
  return {
    actorProofs,
    contentFrameId,
    preparedResourceIds,
    projectionSampleId,
    queuedDebt,
    requiredActors,
  };
}

function preparedFrame({
  candidate: preparedCandidate,
  previousPresentation = null,
  sample,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation?:
    | GpuFlowVisibleFrameCommittedPresentation
    | null
    | undefined;
  readonly sample: GpuFlowVisibleFrameEngineSample;
}): GpuFlowVisibleFramePreparedFrame {
  return {
    candidate: preparedCandidate,
    previousPresentation,
    sample,
  };
}

function engineSample({
  projectionSampleId = "sample-1",
}: {
  readonly projectionSampleId?: GpuFlowProjectionSampleId | undefined;
} = {}): GpuFlowVisibleFrameEngineSample {
  return {
    activeGestureOwner: "retained-section",
    canvasSize: {
      height: 600,
      width: 800,
    },
    currentCommittedFrameId: null,
    dpr: 2,
    projectionSampleId,
    queuedDebt: EMPTY_DEBT,
    retainedScrollOffsets: [
      {
        actorId: "section-a",
        scrollLeft: 0,
        scrollTop: 10,
      },
    ],
    sceneGeneration: "scene-a",
    viewport: rect(),
  };
}

function expectOutcomeKind<
  Kind extends GpuFlowVisibleFrameEngineOutcome["kind"],
>(
  outcome: GpuFlowVisibleFrameEngineOutcome,
  kind: Kind,
): Extract<GpuFlowVisibleFrameEngineOutcome, { readonly kind: Kind }> {
  expect(outcome.kind).toBe(kind);
  if (outcome.kind !== kind) {
    throw new Error(`Expected visible frame outcome ${kind}.`);
  }
  return outcome as Extract<
    GpuFlowVisibleFrameEngineOutcome,
    { readonly kind: Kind }
  >;
}

function exactProof({
  actor,
  generationId = "generation-a",
}: {
  readonly actor: GpuFlowVisibleFrameActorKey;
  readonly generationId?: string | undefined;
}): GpuFlowVisibleFrameActorProof {
  return {
    ...actor,
    generationId,
    proof: "exact",
    requirement: "required",
  };
}

function blockedProof(
  actor: GpuFlowVisibleFrameActorKey,
  reason: string,
): GpuFlowVisibleFrameActorProof {
  return {
    ...actor,
    proof: "blocked",
    reason,
    requirement: "required",
  };
}

function trueHoleProof(
  actor: GpuFlowVisibleFrameActorKey,
  reason: string,
): GpuFlowVisibleFrameActorProof {
  return {
    ...actor,
    proof: "true-hole",
    reason,
    requirement: "required",
    trueHoleCount: 1,
  };
}

function compatibleBrowserProof({
  actor,
  contentFrameId,
  previousPresentation,
  projectionSampleId = "sample-1",
}: {
  readonly actor: GpuFlowVisibleFrameActorKey & {
    readonly family: "browser-visual";
  };
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly previousPresentation: GpuFlowVisibleFrameCommittedPresentation;
  readonly projectionSampleId?: GpuFlowProjectionSampleId | undefined;
}): GpuFlowVisibleFrameActorProof {
  return {
    ...actor,
    compatiblePreviousProof: {
      family: "browser-visual",
      proof: {
        actorId: actor.actorId,
        browserVisualGeneration: "visual-a",
        candidateContentFrameId: contentFrameId,
        candidateProjectionSampleId: projectionSampleId,
        clipChainGeneration: "clip-a",
        previousContentFrameId: previousPresentation.contentFrameId,
        previousPresentationId: previousPresentation.presentationId,
        representationKind: "live-dom",
        resourceId: "host-a",
        scrollProjectionGeneration: "scroll-a",
        semanticGeneration: "semantic-a",
        sourceRect: rect(),
        visibleClip: rect(),
      },
    },
    proof: "compatible-previous",
    requirement: "required",
  };
}

function committedPresentation({
  contentFrameId,
  coverages = [],
  presentationId = createGpuFlowPresentationId("presentation-a"),
}: {
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly coverages?: readonly GpuFlowVisibleFrameCommittedActorCoverage[];
  readonly presentationId?: ReturnType<typeof createGpuFlowPresentationId>;
}): GpuFlowVisibleFrameCommittedPresentation {
  return {
    actorCoverages: coverages,
    contentFrameId,
    presentationId,
  };
}

function coverage({
  actor,
  contentFrameId,
  coversCandidateProjection = true,
}: {
  readonly actor: GpuFlowVisibleFrameActorKey;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly coversCandidateProjection?: boolean | undefined;
}): GpuFlowVisibleFrameCommittedActorCoverage {
  return {
    ...actor,
    compatibleContentFrameIds: [contentFrameId],
    contentFrameId,
    coversCandidateProjection,
    presentationId: createGpuFlowPresentationId("presentation-a"),
  };
}

function rect(): GpuFlowVisibleFrameRect {
  return {
    height: 10,
    width: 10,
    x: 0,
    y: 0,
  };
}
