import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  getGpuFlowBrowserStyleBlockedReasonFamily,
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePresentationProofs";

export type GpuFlowVisibleFrameActorManifestDiagnostics = {
  readonly blockedActorsByFamily: Record<string, number>;
  readonly blockedDebt: Record<string, boolean> | null;
  readonly blockerReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly committedFrameId: number | null;
  readonly compatibleActorsByFamily: Record<string, number>;
  readonly missingActorsByFamily: Record<string, number>;
  readonly presentationId: string | null;
  readonly readyActorsByFamily: Record<string, number>;
  readonly requiredActorsByFamily: Record<string, number>;
  readonly scrollHorizonCoverage: {
    readonly retainedScrollSurfaceCount: number;
    readonly retainedScrollSurfaceActorCount: number;
    readonly visibleRetainedScrollSurfaceCount: number;
  };
  readonly visibleOutcome: string | null;
};

type GpuFlowVisibleFrameActorManifestActorStatus =
  | "blocked"
  | "compatible"
  | "ready";

type GpuFlowVisibleFrameActorFamilyReadiness = Pick<
  GpuFlowVisibleFrameActorManifestDiagnostics,
  | "compatibleActorsByFamily"
  | "missingActorsByFamily"
  | "readyActorsByFamily"
  | "requiredActorsByFamily"
>;

const GPU_FLOW_BLOCKED_TEXT_PROJECTION_COVERAGE = new Set([
  "blocked-awaiting-browser-visual",
  "blocked-awaiting-live-host",
  "true-hole",
]);

export function createGpuFlowVisibleFrameActorManifestDiagnostics({
  blockedReasons = [],
  frame,
  presentationId = null,
  remainingDebt = null,
  visibleOutcome = null,
}: {
  readonly blockedReasons?: readonly GpuFlowBlockedVisibleReason[] | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly presentationId?: string | null | undefined;
  readonly remainingDebt?: Record<string, boolean> | null | undefined;
  readonly visibleOutcome?: string | null | undefined;
}): GpuFlowVisibleFrameActorManifestDiagnostics {
  const blockedActorIds = new Set(
    blockedReasons.flatMap((reason) =>
      reason.actorId === null ? [] : [reason.actorId],
    ),
  );
  const actorReadiness = createGpuFlowVisibleFrameActorFamilyReadiness({
    blockedActorIds,
    frame,
  });
  return Object.freeze({
    blockedActorsByFamily:
      createGpuFlowVisibleFrameBlockedActorsByFamily(blockedReasons),
    blockedDebt:
      remainingDebt === null ? null : Object.freeze({ ...remainingDebt }),
    blockerReasons: Object.freeze([...blockedReasons]),
    committedFrameId: frame?.displayFrameId ?? null,
    compatibleActorsByFamily: actorReadiness.compatibleActorsByFamily,
    missingActorsByFamily: actorReadiness.missingActorsByFamily,
    presentationId,
    readyActorsByFamily: actorReadiness.readyActorsByFamily,
    requiredActorsByFamily: actorReadiness.requiredActorsByFamily,
    scrollHorizonCoverage:
      createGpuFlowVisibleFrameScrollHorizonCoverage(frame),
    visibleOutcome,
  });
}

function createGpuFlowVisibleFrameActorFamilyReadiness({
  blockedActorIds,
  frame,
}: {
  readonly blockedActorIds: ReadonlySet<string>;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
}): GpuFlowVisibleFrameActorFamilyReadiness {
  const requiredActorsByFamily: Record<string, number> = {};
  const readyActorsByFamily: Record<string, number> = {};
  const compatibleActorsByFamily: Record<string, number> = {};
  const missingActorsByFamily: Record<string, number> = {};
  for (const actor of frame?.actorGenerations ?? []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    const family = getGpuFlowVisibleFrameManifestActorFamily(actor);
    incrementGpuFlowVisibleFrameActorFamily(requiredActorsByFamily, family);
    const status = getGpuFlowVisibleFrameManifestActorStatus({
      actor,
      blockedActorIds,
    });
    switch (status) {
      case "ready":
        incrementGpuFlowVisibleFrameActorFamily(readyActorsByFamily, family);
        break;
      case "compatible":
        incrementGpuFlowVisibleFrameActorFamily(
          compatibleActorsByFamily,
          family,
        );
        break;
      case "blocked":
        incrementGpuFlowVisibleFrameActorFamily(missingActorsByFamily, family);
        break;
    }
  }
  return Object.freeze({
    compatibleActorsByFamily: freezeGpuFlowVisibleFrameActorFamilyCounts(
      compatibleActorsByFamily,
    ),
    missingActorsByFamily: freezeGpuFlowVisibleFrameActorFamilyCounts(
      missingActorsByFamily,
    ),
    readyActorsByFamily:
      freezeGpuFlowVisibleFrameActorFamilyCounts(readyActorsByFamily),
    requiredActorsByFamily: freezeGpuFlowVisibleFrameActorFamilyCounts(
      requiredActorsByFamily,
    ),
  });
}

function getGpuFlowVisibleFrameManifestActorStatus({
  actor,
  blockedActorIds,
}: {
  readonly actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
  readonly blockedActorIds: ReadonlySet<string>;
}): GpuFlowVisibleFrameActorManifestActorStatus {
  if (isGpuFlowVisibleFrameManifestActorBlocked({ actor, blockedActorIds })) {
    return "blocked";
  }
  const projectionCoverage = actor.textCoverageProof?.projectionCoverage;
  if (projectionCoverage === "compatible-previous") {
    return "compatible";
  }
  return projectionCoverage &&
    GPU_FLOW_BLOCKED_TEXT_PROJECTION_COVERAGE.has(projectionCoverage)
    ? "blocked"
    : "ready";
}

function isGpuFlowVisibleFrameManifestActorBlocked({
  actor,
  blockedActorIds,
}: {
  readonly actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
  readonly blockedActorIds: ReadonlySet<string>;
}): boolean {
  return (
    blockedActorIds.has(actor.actorId) ||
    !isGpuFlowVisibleFrameManifestReadinessSatisfied(actor.mountReadiness) ||
    !isGpuFlowVisibleFrameManifestReadinessSatisfied(actor.projectionReadiness)
  );
}

function isGpuFlowVisibleFrameManifestReadinessSatisfied(
  readiness: "not-required" | "ready",
): boolean {
  return readiness === "ready" || readiness === "not-required";
}

function createGpuFlowVisibleFrameBlockedActorsByFamily(
  blockedReasons: readonly GpuFlowBlockedVisibleReason[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of blockedReasons) {
    incrementGpuFlowVisibleFrameActorFamily(
      counts,
      getGpuFlowBrowserStyleBlockedReasonFamily(reason),
    );
  }
  return freezeGpuFlowVisibleFrameActorFamilyCounts(counts);
}

function createGpuFlowVisibleFrameScrollHorizonCoverage(
  frame: GpuFlowCommittedSurfaceFrame | null,
): GpuFlowVisibleFrameActorManifestDiagnostics["scrollHorizonCoverage"] {
  const surfaces = frame?.projectionHorizon?.retainedScrollSurfaces ?? [];
  return Object.freeze({
    retainedScrollSurfaceActorCount: surfaces.reduce(
      (sum, surface) => sum + surface.actorCount,
      0,
    ),
    retainedScrollSurfaceCount: surfaces.length,
    visibleRetainedScrollSurfaceCount: surfaces.filter(
      (surface) => surface.visibleNonemptyTextActorCount > 0,
    ).length,
  });
}

function getGpuFlowVisibleFrameManifestActorFamily(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): string {
  return getGpuFlowBrowserStyleVisibleFrameActorFamily(actor);
}

function incrementGpuFlowVisibleFrameActorFamily(
  counts: Record<string, number>,
  family: string,
): void {
  counts[family] = (counts[family] ?? 0) + 1;
}

function freezeGpuFlowVisibleFrameActorFamilyCounts(
  counts: Record<string, number>,
): Record<string, number> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}
