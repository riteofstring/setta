import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceCompleteness,
} from "./committedSurfaceFrame";

export function createGpuFlowCommittedSurfaceCompleteness({
  actorGenerations,
  startup,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly startup: boolean;
}): GpuFlowCommittedSurfaceCompleteness {
  const visibleBrowserOwnedActors = actorGenerations.filter(
    (actor) =>
      isGpuFlowCommittedSurfaceCompletenessBlockingActor({ actor, startup }),
  );
  const visibleNonemptyDomControls = actorGenerations.filter(
    (actor) => actor.kind === "dom-control" && actor.visibleNonempty,
  );
  const projectedVisibleNonemptyDomControls = visibleNonemptyDomControls.filter(
    (actor) =>
      actor.mountReadiness === "ready" && actor.projectionReadiness === "ready",
  );
  const blockingActorIds = visibleBrowserOwnedActors
    .filter(
      (actor) =>
        actor.mountReadiness !== "ready" ||
        actor.projectionReadiness !== "ready",
    )
    .map((actor) => actor.actorId);
  const status =
    blockingActorIds.length === 0
      ? "complete"
      : startup
        ? "startup"
        : "blocked";
  return Object.freeze({
    blockingActorIds: Object.freeze(blockingActorIds),
    projectedVisibleNonemptyDomControlCount:
      projectedVisibleNonemptyDomControls.length,
    status,
    visibleNonemptyDomControlCount: visibleNonemptyDomControls.length,
  });
}

export function isGpuFlowCommittedSurfaceCompletenessBlockingActor({
  actor,
  startup,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly startup: boolean;
}): boolean {
  if (!(actor.browserVisual?.coverageRequired?.required ?? false)) {
    return false;
  }
  if (startup) {
    return true;
  }
  if (actor.kind !== "dom-control") {
    return true;
  }
  return isGpuFlowCommittedSurfaceCompletenessBlockingDomControl(actor);
}

function isGpuFlowCommittedSurfaceCompletenessBlockingDomControl(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  if (actor.textCoverageProof === null) {
    return true;
  }
  if (actor.textCoverageProof.projectionCoverage === "true-hole") {
    return true;
  }
  return (
    actor.active || actor.browserVisual?.representationKind === "active-editor"
  );
}

export function assertGpuFlowCommittedSurfaceCompleteness(
  left: GpuFlowCommittedSurfaceCompleteness,
  right: GpuFlowCommittedSurfaceCompleteness,
): void {
  if (
    left.status !== right.status ||
    left.visibleNonemptyDomControlCount !==
      right.visibleNonemptyDomControlCount ||
    left.projectedVisibleNonemptyDomControlCount !==
      right.projectedVisibleNonemptyDomControlCount ||
    left.blockingActorIds.length !== right.blockingActorIds.length ||
    left.blockingActorIds.some(
      (actorId, index) => actorId !== right.blockingActorIds[index],
    )
  ) {
    throw new Error(
      "GPU Flow committed surface frame has stale display completeness.",
    );
  }
}
