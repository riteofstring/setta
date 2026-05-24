import { describe, expect, it } from "vitest";

import {
  resolveGpuFlowDomControlCompatiblePreviousAssignments,
  type GpuFlowDomControlPromotedRepresentation,
} from "./domControlPlaneCompatibility";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import { domControl } from "./domControlPlaneProjectionRuntimeTestUtils";

describe("GPU flow DOM control projection compatibility", () => {
  it("keeps near-future live controls coverage-exempt instead of requiring compatible previous proof", () => {
    const control = domControl({
      index: 80,
      projectionVisibility: "outside-viewport",
      visualPolicy: "outside-viewport",
    });
    const assignment = domControlAssignment({
      control,
      reason: "near-future-live",
    });

    const [resolvedAssignment] =
      resolveGpuFlowDomControlCompatiblePreviousAssignments({
        assignments: [assignment],
        promotedRepresentationByControlId: promotedRepresentationMap(control),
      });

    expect(resolvedAssignment).toEqual(assignment);
  });

  it("still uses compatible previous proof for live-host overflow controls", () => {
    const control = domControl({
      index: 80,
      projectionVisibility: "viewport-visible",
      visualPolicy: "live-dom",
    });
    const assignment = domControlAssignment({
      control,
      reason: "live-host-overflow",
    });

    const [resolvedAssignment] =
      resolveGpuFlowDomControlCompatiblePreviousAssignments({
        assignments: [assignment],
        promotedRepresentationByControlId: promotedRepresentationMap(control),
      });

    expect(resolvedAssignment).toEqual(
      expect.objectContaining({
        compatibilityProof: expect.objectContaining({
          actorId: control.sourceId,
          reasonCode: "same-value-and-geometry",
        }),
        coverageState: "compatible-previous",
        reason: "compatible-previous-proof",
      }),
    );
  });
});

function domControlAssignment({
  control,
  reason,
}: Pick<GpuFlowDomControlProjectionAssignment, "control" | "reason">) {
  return {
    compatibilityProof: null,
    control,
    coverageState: "blocked-awaiting-live-host",
    phase: "prepare",
    priority: 7,
    reason,
  } satisfies GpuFlowDomControlProjectionAssignment;
}

function promotedRepresentationMap(
  control: GpuFlowDomControlProjectionAssignment["control"],
): ReadonlyMap<string, GpuFlowDomControlPromotedRepresentation> {
  return new Map([
    [
      control.sourceId,
      {
        compatiblePreviousFrameCount: 0,
        control,
      },
    ],
  ]);
}
