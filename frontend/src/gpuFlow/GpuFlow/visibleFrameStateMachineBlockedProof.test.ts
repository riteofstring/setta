import { describe, expect, it } from "vitest";

import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowVisibleFrameStateMachineOutcome } from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePublicationStateMachineBlockedProof } from "./visibleFrameStateMachineBlockedProof";
import type { GpuFlowVisibleFramePresentationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  createGpuFlowContentFrameId,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
} from "./visibleFrameTypes";

const QUEUED_DEBT = Object.freeze({
  browserVisual: true,
  content: false,
  maintenance: false,
  motion: false,
});

describe("GPU Flow visible frame state machine blocked proof", () => {
  it("keeps every blocked required candidate actor in the state-machine fallback proof", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "debug-a",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
        }),
        blockedActorProof({
          actorId: "debug-b",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
        }),
        blockedActorProof({
          actorId: "maintenance-a",
          family: "public-runtime-state",
          reason: "runtime-state-pending",
          requirement: "maintenance",
        }),
        exactActorProof({
          actorId: "retained-page",
          family: "retained-page",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "debug-b",
        family: "debug-snapshot",
        proof: "blocked",
        reason: "debug-snapshot-pending",
      }),
    });

    expect(proof).toEqual({
      blockedReasons: [
        {
          actorId: "debug-a",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
        },
        {
          actorId: "debug-b",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
        },
      ],
      candidate: {
        blockedReasons: [
          {
            actorId: "debug-a",
            family: "debug-snapshot",
            reason: "debug-snapshot-pending",
          },
          {
            actorId: "debug-b",
            family: "debug-snapshot",
            reason: "debug-snapshot-pending",
          },
        ],
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      },
      frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      source: "actor-proof",
    });
  });

  it("collapses browser visual cold-start blockers to a browser visual shell reason", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "snapshot-a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
        blockedActorProof({
          actorId: "snapshot-b",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "snapshot-a",
        family: "browser-text-snapshot",
        proof: "blocked",
        reason: "snapshot-pending",
      }),
    });

    expect(proof).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "browser-visual",
          reason: "snapshot-pending",
        },
      ],
      candidate: {
        blockedReasons: [
          {
            actorId: null,
            family: "browser-visual",
            reason: "snapshot-pending",
          },
        ],
        frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      },
      frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      source: "actor-proof",
    });
  });

  it("omits passive browser visual blockers already visible in the frozen frame", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "visible-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
        blockedActorProof({
          actorId: "new-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
      ]),
      previousVisibleProjectionState: previousVisibleProjectionState([
        previousDomControlActor({ actorId: "visible-a" }),
      ]),
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "visible-a",
        family: "browser-text-control",
        proof: "blocked",
        reason: "live-dom-budget",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: "new-a",
        family: "browser-text-control",
        reason: "live-dom-budget",
      },
    ]);
    expect(proof?.frozenFrameId).toBe(9);
  });

  it("omits passive DOM-control blockers retained by the frozen frame even when visually empty", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "mounted-empty-control",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
        blockedActorProof({
          actorId: "new-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
      ]),
      previousVisibleProjectionState: previousVisibleProjectionState([
        previousDomControlActor({
          actorId: "mounted-empty-control",
          visibleNonempty: false,
        }),
      ]),
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "mounted-empty-control",
        family: "browser-text-control",
        proof: "blocked",
        reason: "live-dom-budget",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: "new-a",
        family: "browser-text-control",
        reason: "live-dom-budget",
      },
    ]);
  });

  it("collapses fully frozen passive browser visual blockers to a frame-level reason", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "visible-a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
      ]),
      previousVisibleProjectionState: previousVisibleProjectionState([
        previousDomControlActor({ actorId: "visible-a" }),
      ]),
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "visible-a",
        family: "browser-text-snapshot",
        proof: "blocked",
        reason: "snapshot-pending",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: null,
        family: "browser-visual",
        reason: "snapshot-pending",
      },
    ]);
  });

  it("preserves active browser visual blockers even when they are visible in the frozen frame", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "active-a",
          family: "active-editor",
          reason: "live-dom-budget",
        }),
      ]),
      previousVisibleProjectionState: previousVisibleProjectionState([
        previousDomControlActor({ active: true, actorId: "active-a" }),
      ]),
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "active-a",
        family: "active-editor",
        proof: "blocked",
        reason: "live-dom-budget",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: "active-a",
        family: "active-editor",
        reason: "live-dom-budget",
      },
    ]);
  });

  it("normalizes selected blocking proofs against the frozen visible frame", () => {
    const blockingProof = {
      blockedReasons: [
        {
          actorId: "visible-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        },
        {
          actorId: "new-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        },
      ],
      candidate: {
        blockedReasons: [
          {
            actorId: "visible-a",
            family: "browser-text-control",
            reason: "live-dom-budget",
          },
          {
            actorId: "new-a",
            family: "browser-text-control",
            reason: "live-dom-budget",
          },
        ],
        frozenFrameId: 9,
      },
      frozenFrameId: 9,
      source: "content-publication",
    } satisfies GpuFlowVisibleFramePresentationBlockedProof;
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [blockingProof],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "visible-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
        blockedActorProof({
          actorId: "new-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        }),
      ]),
      previousVisibleProjectionState: previousVisibleProjectionState([
        previousDomControlActor({ actorId: "visible-a" }),
      ]),
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "visible-a",
        family: "browser-text-control",
        proof: "blocked",
        reason: "live-dom-budget",
      }),
    });

    expect(proof).toEqual({
      ...blockingProof,
      blockedReasons: [
        {
          actorId: "new-a",
          family: "browser-text-control",
          reason: "live-dom-budget",
        },
      ],
      candidate: {
        ...blockingProof.candidate,
        blockedReasons: [
          {
            actorId: "new-a",
            family: "browser-text-control",
            reason: "live-dom-budget",
          },
        ],
      },
    });
  });

  it("preserves explicit concrete frozen frame ids from selected blocking proofs", () => {
    const blockingProof = {
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "retained-projection-coverage-missing",
        },
      ],
      candidate: {
        blockedReasons: [
          {
            actorId: null,
            family: "retained-projection",
            reason: "retained-projection-coverage-missing",
          },
        ],
        frozenFrameId: 9,
      },
      frozenFrameId: 9,
      source: "motion-projection",
    } satisfies GpuFlowVisibleFramePresentationBlockedProof;
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [blockingProof],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId:
            "blocked:retained-projection:retained-projection-coverage-missing:0",
          family: "retained-page",
          reason: "retained-projection-coverage-missing",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId:
          "blocked:retained-projection:retained-projection-coverage-missing:0",
        family: "retained-page",
        proof: "blocked",
        reason: "retained-projection-coverage-missing",
      }),
    });

    expect(proof).toBe(blockingProof);
  });

  it("falls back to the deciding proof when the candidate does not contain that blocker", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "debug-a",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "debug-b",
        family: "debug-snapshot",
        proof: "blocked",
        reason: "debug-snapshot-pending",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: "debug-b",
        family: "debug-snapshot",
        reason: "debug-snapshot-pending",
      },
    ]);
  });
});

function candidateWithActorProofs(
  actorProofs: readonly GpuFlowVisibleFrameActorProof[],
): GpuFlowVisibleFrameCandidate {
  return Object.freeze({
    actorProofs,
    contentFrameId: createGpuFlowContentFrameId("content:test"),
    preparedResourceIds: Object.freeze([]),
    projectionSampleId: "sample:test",
    queuedDebt: QUEUED_DEBT,
    requiredActors: Object.freeze(
      actorProofs
        .filter((proof) => proof.requirement === "required")
        .map((proof) => ({
          actorId: proof.actorId,
          family: proof.family,
        })),
    ),
  });
}

function blockedActorProof({
  actorId,
  family,
  reason,
  requirement = "required",
}: {
  readonly actorId: GpuFlowVisibleFrameActorProof["actorId"];
  readonly family: GpuFlowVisibleFrameActorProof["family"];
  readonly reason: string;
  readonly requirement?: GpuFlowVisibleFrameActorProof["requirement"];
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    actorId,
    family,
    proof: "blocked",
    reason,
    requirement,
  });
}

function exactActorProof({
  actorId,
  family,
}: {
  readonly actorId: GpuFlowVisibleFrameActorProof["actorId"];
  readonly family: GpuFlowVisibleFrameActorProof["family"];
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    actorId,
    family,
    generationId: "generation:test",
    proof: "exact",
    requirement: "required",
  });
}

function previousVisibleProjectionState(
  actorGenerations: readonly {
    readonly active: boolean;
    readonly actorFamily: string;
    readonly actorId: string;
    readonly visibleNonempty: boolean;
  }[],
): GpuFlowVisibleProjectionState {
  return {
    preparedContentFrame: {
      actorGenerations,
      displayFrameId: 9,
    },
  } as GpuFlowVisibleProjectionState;
}

function previousDomControlActor({
  active = false,
  actorId,
  visibleNonempty = true,
}: {
  readonly active?: boolean | undefined;
  readonly actorId: string;
  readonly visibleNonempty?: boolean | undefined;
}) {
  return {
    active,
    actorFamily: active ? "active-editor" : "text-like-dom-control",
    actorId,
    kind: "dom-control",
    visibleNonempty,
  };
}

function blockedOutcome(
  decidingProof: NonNullable<
    GpuFlowVisibleFrameStateMachineOutcome["decidingProof"]
  >,
): GpuFlowVisibleFrameStateMachineOutcome {
  return {
    debt: QUEUED_DEBT,
    decidingProof,
    kind: "blocked-cold-start",
    shellFrameId: "cold-start-shell",
  } as GpuFlowVisibleFrameStateMachineOutcome;
}
