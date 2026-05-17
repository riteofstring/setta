import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceCompleteness,
  GpuFlowContentFramePublishability,
  GpuFlowProjectionHorizon,
} from "./committedSurfaceFrame";

type GpuFlowProjectionHorizonSurfaceEntry = {
  actorCount: number;
  committedScrollOffset: { readonly x: number; readonly y: number } | null;
  textActorCount: number;
  visibleNonemptyTextActorCount: number;
};

const GPU_FLOW_RETAINED_SCROLL_PREPARATION_HORIZON_CSS_PX = 720;

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
  const visibleNonemptyTextTrueHoleActorIds = textActors
    .filter(
      (actor) =>
        actor.visibleNonempty &&
        actor.textCoverageProof?.projectionCoverage === "true-hole",
    )
    .map((actor) => actor.actorId)
    .sort();
  const status: GpuFlowContentFramePublishability["status"] = startup
    ? "startup"
    : displayCompleteness.status === "complete"
      ? "publishable"
      : "blocked";
  const base = {
    blockingActorIds: Object.freeze([...displayCompleteness.blockingActorIds]),
    status,
    textActorCount: textActors.length,
    textActorExactCoverageCount: textActors.filter(
      (actor) =>
        actor.textCoverageProof?.projectionCoverage === "exact-live-dom" ||
        actor.textCoverageProof?.projectionCoverage === "exact-snapshot",
    ).length,
    transactionOutcome,
    visibleNonemptyTextActorCount: textActors.filter(
      (actor) => actor.visibleNonempty,
    ).length,
  };
  if (visibleNonemptyTextTrueHoleActorIds.length > 0) {
    return Object.freeze({
      ...base,
      actorFamily: "text-like-dom-control",
      actorIds: Object.freeze(visibleNonemptyTextTrueHoleActorIds),
      kind: "true-hole",
      reason: "text-actor-true-hole",
    });
  }
  if (displayCompleteness.blockingActorIds.length > 0) {
    if (startup) {
      return Object.freeze({
        ...base,
        kind: "block-first-publication",
        reason: "visible-dom-control-not-projected",
      });
    }
    return Object.freeze({
      ...base,
      kind: "hold-previous",
      reason: "visible-dom-control-not-projected",
    });
  }
  return Object.freeze({
    ...base,
    kind: "publishable",
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
  const surfaces = collectGpuFlowProjectionHorizonSurfaces(actorGenerations);
  const textActors = actorGenerations.filter(isGpuFlowCommittedTextActor);
  return Object.freeze({
    actorFamilyCoverage:
      createGpuFlowProjectionActorFamilyCoverage(actorGenerations),
    obligations: createGpuFlowProjectionHorizonObligations(actorGenerations),
    retainedScrollSurfaces:
      createGpuFlowProjectionRetainedScrollSurfaces(surfaces),
    textActorCoverage: createGpuFlowProjectionTextActorCoverage(textActors),
    viewport: Object.freeze({
      anchorFrameId: displayFrameId,
      mode: "transform-only",
      overscanCssPx: 0,
      preparedBounds: null,
    }),
  });
}

function createGpuFlowProjectionHorizonObligations(
  actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[],
): GpuFlowProjectionHorizon["obligations"] {
  const visibleActorIds: string[] = [];
  const activePinnedActorIds: string[] = [];
  const nearFutureActorIds: string[] = [];
  const maintenanceActorIds: string[] = [];
  for (const actor of actorGenerations) {
    if (actor.active) {
      activePinnedActorIds.push(actor.actorId);
    }
    if (actor.visibleNonempty) {
      visibleActorIds.push(actor.actorId);
      continue;
    }
    if (isGpuFlowCommittedTextActor(actor)) {
      nearFutureActorIds.push(actor.actorId);
      continue;
    }
    maintenanceActorIds.push(actor.actorId);
  }
  return Object.freeze({
    activePinnedActorIds: Object.freeze(activePinnedActorIds.sort()),
    maintenanceActorIds: Object.freeze(maintenanceActorIds.sort()),
    nearFutureActorIds: Object.freeze(nearFutureActorIds.sort()),
    visibleActorIds: Object.freeze(visibleActorIds.sort()),
  });
}

function collectGpuFlowProjectionHorizonSurfaces(
  actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[],
): ReadonlyMap<string, GpuFlowProjectionHorizonSurfaceEntry> {
  const surfaces = new Map<string, GpuFlowProjectionHorizonSurfaceEntry>();
  for (const actor of actorGenerations) {
    addGpuFlowProjectionHorizonSurfaceActor({ actor, surfaces });
  }
  return surfaces;
}

function addGpuFlowProjectionHorizonSurfaceActor({
  actor,
  surfaces,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly surfaces: Map<string, GpuFlowProjectionHorizonSurfaceEntry>;
}): void {
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

function createGpuFlowProjectionActorFamilyCoverage(
  actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[],
): GpuFlowProjectionHorizon["actorFamilyCoverage"] {
  const actorIdsByKind = {
    domControlActorIds: [] as string[],
    domIslandActorIds: [] as string[],
    gpuNativeVisualActorIds: [] as string[],
    htmlTextureActorIds: [] as string[],
    retainedPageActorIds: [] as string[],
  };
  for (const actor of actorGenerations) {
    collectGpuFlowProjectionActorFamilyId({ actor, actorIdsByKind });
  }
  return Object.freeze({
    domControlActorIds: Object.freeze(actorIdsByKind.domControlActorIds.sort()),
    domIslandActorIds: Object.freeze(actorIdsByKind.domIslandActorIds.sort()),
    gpuNativeVisualActorIds: Object.freeze(
      actorIdsByKind.gpuNativeVisualActorIds.sort(),
    ),
    htmlTextureActorIds: Object.freeze(
      actorIdsByKind.htmlTextureActorIds.sort(),
    ),
    retainedPageActorIds: Object.freeze(
      actorIdsByKind.retainedPageActorIds.sort(),
    ),
  });
}

function collectGpuFlowProjectionActorFamilyId({
  actor,
  actorIdsByKind,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly actorIdsByKind: {
    readonly domControlActorIds: string[];
    readonly domIslandActorIds: string[];
    readonly gpuNativeVisualActorIds: string[];
    readonly htmlTextureActorIds: string[];
    readonly retainedPageActorIds: string[];
  };
}): void {
  switch (actor.kind) {
    case "dom-control":
      actorIdsByKind.domControlActorIds.push(actor.actorId);
      break;
    case "dom-island":
      actorIdsByKind.domIslandActorIds.push(actor.actorId);
      break;
    case "gpu-native-visual":
      actorIdsByKind.gpuNativeVisualActorIds.push(actor.actorId);
      break;
    case "html-texture":
      actorIdsByKind.htmlTextureActorIds.push(actor.actorId);
      break;
    case "retained-page":
      actorIdsByKind.retainedPageActorIds.push(actor.actorId);
      break;
  }
}

function createGpuFlowProjectionRetainedScrollSurfaces(
  surfaces: ReadonlyMap<string, GpuFlowProjectionHorizonSurfaceEntry>,
): GpuFlowProjectionHorizon["retainedScrollSurfaces"] {
  return Object.freeze(
    [...surfaces.entries()]
      .map(([surfaceId, entry]) =>
        Object.freeze({
          actorCount: entry.actorCount,
          committedScrollOffset: entry.committedScrollOffset
            ? Object.freeze({ ...entry.committedScrollOffset })
            : null,
          preparedScrollRange: createGpuFlowProjectionPreparedScrollRange(
            entry.committedScrollOffset,
          ),
          surfaceId,
          textActorCount: entry.textActorCount,
          visibleNonemptyTextActorCount: entry.visibleNonemptyTextActorCount,
        }),
      )
      .sort((left, right) => left.surfaceId.localeCompare(right.surfaceId)),
  );
}

function createGpuFlowProjectionPreparedScrollRange(
  committedScrollOffset: GpuFlowProjectionHorizonSurfaceEntry["committedScrollOffset"],
): GpuFlowProjectionHorizon["retainedScrollSurfaces"][number]["preparedScrollRange"] {
  return Object.freeze({
    x: committedScrollOffset
      ? Object.freeze({
          max:
            committedScrollOffset.x +
            GPU_FLOW_RETAINED_SCROLL_PREPARATION_HORIZON_CSS_PX,
          min: Math.max(
            0,
            committedScrollOffset.x -
              GPU_FLOW_RETAINED_SCROLL_PREPARATION_HORIZON_CSS_PX,
          ),
        })
      : null,
    y: committedScrollOffset
      ? Object.freeze({
          max:
            committedScrollOffset.y +
            GPU_FLOW_RETAINED_SCROLL_PREPARATION_HORIZON_CSS_PX,
          min: Math.max(
            0,
            committedScrollOffset.y -
              GPU_FLOW_RETAINED_SCROLL_PREPARATION_HORIZON_CSS_PX,
          ),
        })
      : null,
  });
}

function createGpuFlowProjectionTextActorCoverage(
  textActors: readonly GpuFlowCommittedSurfaceActorGeneration[],
): GpuFlowProjectionHorizon["textActorCoverage"] {
  return Object.freeze({
    blockedAwaitingBrowserVisualActorIds: Object.freeze(
      textActors
        .filter(
          (actor) =>
            actor.textCoverageProof?.projectionCoverage ===
            "blocked-awaiting-browser-visual",
        )
        .map((actor) => actor.actorId)
        .sort(),
    ),
    blockedAwaitingLiveHostActorIds: Object.freeze(
      textActors
        .filter(
          (actor) =>
            actor.textCoverageProof?.projectionCoverage ===
            "blocked-awaiting-live-host",
        )
        .map((actor) => actor.actorId)
        .sort(),
    ),
    compatiblePreviousActorIds: Object.freeze(
      textActors
        .filter(
          (actor) =>
            actor.textCoverageProof?.projectionCoverage ===
            "compatible-previous",
        )
        .map((actor) => actor.actorId)
        .sort(),
    ),
    exactLiveDomActorIds: Object.freeze(
      textActors
        .filter(
          (actor) =>
            actor.textCoverageProof?.projectionCoverage === "exact-live-dom",
        )
        .map((actor) => actor.actorId)
        .sort(),
    ),
    exactSnapshotActorIds: Object.freeze(
      textActors
        .filter(
          (actor) =>
            actor.textCoverageProof?.projectionCoverage === "exact-snapshot",
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
