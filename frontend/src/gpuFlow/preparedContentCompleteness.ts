import type {
  GpuFlowPreparedContentActorGeneration,
  GpuFlowPreparedContentCompleteness,
} from "./preparedContentFrame";

export function createGpuFlowPreparedContentCompleteness({
  actorGenerations,
  startup,
}: {
  readonly actorGenerations: readonly GpuFlowPreparedContentActorGeneration[];
  readonly startup: boolean;
}): GpuFlowPreparedContentCompleteness {
  const visibleBrowserOwnedActors = actorGenerations.filter((actor) =>
    isGpuFlowPreparedContentCompletenessBlockingActor({ actor, startup }),
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

export function isGpuFlowPreparedContentCompletenessBlockingActor({
  actor,
  startup,
}: {
  readonly actor: GpuFlowPreparedContentActorGeneration;
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
  return isGpuFlowPreparedContentCompletenessBlockingDomControl(actor);
}

function isGpuFlowPreparedContentCompletenessBlockingDomControl(
  actor: GpuFlowPreparedContentActorGeneration,
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

export function assertGpuFlowPreparedContentCompleteness(
  left: GpuFlowPreparedContentCompleteness,
  right: GpuFlowPreparedContentCompleteness,
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
      "GPU Flow prepared content frame has stale display completeness.",
    );
  }
}
