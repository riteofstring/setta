import { describe, expect, it } from "vitest";

import type { GpuFlowVisibleFrameStateMachineOutcome } from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePublicationStateMachineBlockedProof } from "./visibleFrameStateMachineBlockedProof";
import {
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
          actorId: "snapshot-a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
        blockedActorProof({
          actorId: "snapshot-b",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
        blockedActorProof({
          actorId: "maintenance-a",
          family: "debug-snapshot",
          reason: "debug-snapshot-pending",
          requirement: "maintenance",
        }),
        exactActorProof({
          actorId: "retained-page",
          family: "retained-page",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "snapshot-b",
        family: "browser-text-snapshot",
        proof: "blocked",
        reason: "snapshot-pending",
      }),
    });

    expect(proof).toEqual({
      blockedReasons: [
        {
          actorId: "snapshot-a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        },
        {
          actorId: "snapshot-b",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        },
      ],
      candidate: {
        blockedReasons: [
          {
            actorId: "snapshot-a",
            family: "browser-text-snapshot",
            reason: "snapshot-pending",
          },
          {
            actorId: "snapshot-b",
            family: "browser-text-snapshot",
            reason: "snapshot-pending",
          },
        ],
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      },
      frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
      source: "actor-proof",
    });
  });

  it("falls back to the deciding proof when the candidate does not contain that blocker", () => {
    const proof = createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
      blockingProofs: [],
      candidate: candidateWithActorProofs([
        blockedActorProof({
          actorId: "snapshot-a",
          family: "browser-text-snapshot",
          reason: "snapshot-pending",
        }),
      ]),
      previousVisibleProjectionState: null,
      visibleFrameStateMachineOutcome: blockedOutcome({
        actorId: "snapshot-b",
        family: "browser-text-snapshot",
        proof: "blocked",
        reason: "snapshot-pending",
      }),
    });

    expect(proof?.blockedReasons).toEqual([
      {
        actorId: "snapshot-b",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
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
