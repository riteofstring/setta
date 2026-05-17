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
    (actor) => actor.browserVisual?.coverageRequired.required ?? false,
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
