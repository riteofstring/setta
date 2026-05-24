import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowVisibleFrameActorManifest,
  createGpuFlowVisibleFrameActorProofsForManifest,
} from "./visibleFrameActorManifest";
import { getGpuFlowBrowserStyleBlockedReasonFamily } from "./visibleFrameActorRegistry";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePresentationProofs";
import { createGpuFlowContentFrameId } from "./visibleFrameTypes";

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
  const actorReadiness = createGpuFlowVisibleFrameActorFamilyReadiness({
    blockedReasons,
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
  frame,
  blockedReasons,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
}): GpuFlowVisibleFrameActorFamilyReadiness {
  const requiredActorsByFamily: Record<string, number> = {};
  const readyActorsByFamily: Record<string, number> = {};
  const compatibleActorsByFamily: Record<string, number> = {};
  const missingActorsByFamily: Record<string, number> = {};
  const manifest = createGpuFlowVisibleFrameActorManifest({
    blockedReasons,
    frame,
  });
  const proofByActor = new Map(
    createGpuFlowVisibleFrameActorProofsForManifest({
      contentFrameId: createGpuFlowContentFrameId(
        frame === null ? "diagnostic:no-frame" : String(frame.displayFrameId),
      ),
      frame,
      manifest,
      projectionSampleId: "diagnostic",
    }).map((proof) => [`${proof.family}:${proof.actorId}`, proof]),
  );
  for (const actor of manifest.requiredActors) {
    const family = actor.family;
    incrementGpuFlowVisibleFrameActorFamily(requiredActorsByFamily, family);
    const status = getGpuFlowVisibleFrameManifestActorStatus({
      proof: proofByActor.get(`${actor.family}:${actor.actorId}`),
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
  proof,
}: {
  readonly proof:
    | ReturnType<typeof createGpuFlowVisibleFrameActorProofsForManifest>[number]
    | undefined;
}): GpuFlowVisibleFrameActorManifestActorStatus {
  if (proof === undefined) {
    return "blocked";
  }
  if (proof.proof === "compatible-previous") {
    return "compatible";
  }
  return proof.proof === "blocked" || proof.proof === "true-hole"
    ? "blocked"
    : "ready";
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
