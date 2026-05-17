import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceCompleteness,
  GpuFlowContentFramePublishability,
  GpuFlowProjectionHorizon,
} from "./committedSurfaceFrame";

export function createGpuFlowContentFramePublishability({
  actorGenerations,
  displayCompleteness,
  startup,
  transactionOutcome,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly displayCompleteness: GpuFlowCommittedSurfaceCompleteness;
  readonly startup: boolean;
  readonly transactionOutcome: string;
}): GpuFlowContentFramePublishability {
  const textActors = actorGenerations.filter(isGpuFlowCommittedTextActor);
  return Object.freeze({
    blockingActorIds: Object.freeze([...displayCompleteness.blockingActorIds]),
    status: startup
      ? "startup"
      : displayCompleteness.status === "complete"
        ? "publishable"
        : "blocked",
    textActorCount: textActors.length,
    textActorExactCoverageCount: textActors.filter(
      (actor) =>
        actor.textCoverageProof?.projectionCoverage === "exact-live-dom",
    ).length,
    transactionOutcome,
    visibleNonemptyTextActorCount: textActors.filter(
      (actor) => actor.visibleNonempty,
    ).length,
  });
}

export function assertGpuFlowContentFramePublishability(
  left: GpuFlowContentFramePublishability,
  right: GpuFlowContentFramePublishability,
): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(
      "GPU Flow committed surface frame has stale content publishability.",
    );
  }
}

export function createGpuFlowProjectionHorizon({
  actorGenerations,
  displayFrameId,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly displayFrameId: number;
}): GpuFlowProjectionHorizon {
  const surfaces = new Map<
    string,
    {
      actorCount: number;
      committedScrollOffset: { readonly x: number; readonly y: number } | null;
      textActorCount: number;
      visibleNonemptyTextActorCount: number;
    }
  >();
  for (const actor of actorGenerations) {
    const entry = surfaces.get(actor.ownerSurfaceId) ?? {
      actorCount: 0,
      committedScrollOffset: null,
      textActorCount: 0,
      visibleNonemptyTextActorCount: 0,
    };
    entry.actorCount += 1;
    entry.committedScrollOffset ??= actor.retainedScrollOffset
      ? { ...actor.retainedScrollOffset }
      : null;
    if (isGpuFlowCommittedTextActor(actor)) {
      entry.textActorCount += 1;
      if (actor.visibleNonempty) {
        entry.visibleNonemptyTextActorCount += 1;
      }
    }
    surfaces.set(actor.ownerSurfaceId, entry);
  }
  const textActors = actorGenerations.filter(isGpuFlowCommittedTextActor);
  return Object.freeze({
    retainedScrollSurfaces: Object.freeze(
      [...surfaces.entries()]
        .map(([surfaceId, entry]) =>
          Object.freeze({
            actorCount: entry.actorCount,
            committedScrollOffset: entry.committedScrollOffset
              ? Object.freeze({ ...entry.committedScrollOffset })
              : null,
            surfaceId,
            textActorCount: entry.textActorCount,
            visibleNonemptyTextActorCount: entry.visibleNonemptyTextActorCount,
          }),
        )
        .sort((left, right) => left.surfaceId.localeCompare(right.surfaceId)),
    ),
    textActorCoverage: Object.freeze({
      exactLiveDomActorIds: Object.freeze(
        textActors
          .filter(
            (actor) =>
              actor.textCoverageProof?.projectionCoverage === "exact-live-dom",
          )
          .map((actor) => actor.actorId)
          .sort(),
      ),
      trueHoleActorIds: Object.freeze(
        textActors
          .filter(
            (actor) =>
              actor.textCoverageProof?.projectionCoverage === "true-hole",
          )
          .map((actor) => actor.actorId)
          .sort(),
      ),
    }),
    viewport: Object.freeze({
      anchorFrameId: displayFrameId,
      mode: "transform-only",
    }),
  });
}

export function assertGpuFlowProjectionHorizon(
  left: GpuFlowProjectionHorizon,
  right: GpuFlowProjectionHorizon,
): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(
      "GPU Flow committed surface frame has stale projection horizon.",
    );
  }
}

export function isGpuFlowCommittedTextActor(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  return actor.actorFamily === "text-like-dom-control";
}
