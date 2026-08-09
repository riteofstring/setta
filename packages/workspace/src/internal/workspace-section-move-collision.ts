import {
  clearCollisionTarget,
  pickCollisionCandidate,
  resolveCollisionFrame,
  type CollisionCandidate,
  type CollisionTrackerState,
  type ListOrientation,
} from "./collision-characterization.js";
import type { WorkspaceRect } from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionPoint,
  type InteractionRect,
} from "./interaction-geometry.js";
import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";

export type WorkspaceSectionMoveDirection = "ltr" | "rtl";

export type WorkspaceSectionMoveRegion = Readonly<{
  clientRect: InteractionRect;
  direction: WorkspaceSectionMoveDirection;
  gap: number;
  orientation: ListOrientation;
  parentSectionId: string;
  workspaceRect: WorkspaceRect;
}>;

type WorkspaceSectionCollisionTarget = Readonly<{
  destinationIndex: number;
  destinationParentId: string;
  direction: WorkspaceSectionMoveDirection;
  orientation: ListOrientation;
  region: WorkspaceSectionMoveRegion;
  targetSectionId: string | null;
}>;

export type WorkspaceSectionCollisionResolution = Readonly<{
  collisionState: CollisionTrackerState;
  reason: string;
  target: WorkspaceSectionCollisionTarget | null;
}>;

type CollisionTargetMetadata = Readonly<{
  candidateId: string;
  destinationIds: readonly string[];
  region: WorkspaceSectionMoveRegion;
  targetSectionId: string | null;
}>;

type CollisionEntry = Readonly<{
  candidate: CollisionCandidate;
  metadata: CollisionTargetMetadata;
}>;

function sectionCandidateId(sectionId: string): string {
  return JSON.stringify(["section", sectionId]);
}

function regionCandidateId(parentSectionId: string): string {
  return JSON.stringify(["region", parentSectionId]);
}

function intersectionRect(left: InteractionRect, right: InteractionRect): InteractionRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.right, right.right);
  const bottom = Math.min(left.bottom, right.bottom);
  return x < rightEdge && y < bottom
    ? createInteractionRect(x, y, rightEdge - x, bottom - y)
    : null;
}

function intersectionArea(left: InteractionRect, right: InteractionRect): number {
  const intersection = intersectionRect(left, right);
  return intersection ? intersection.width * intersection.height : 0;
}

function directionalTriggerDistance(
  activeRect: InteractionRect,
  targetRect: InteractionRect,
  region: WorkspaceSectionMoveRegion,
): number {
  if (region.orientation === "horizontal") {
    return activeRect.y - targetRect.y;
  }
  return region.direction === "rtl"
    ? targetRect.right - activeRect.right
    : activeRect.x - targetRect.x;
}

function collisionEntry(
  activeRect: InteractionRect,
  candidateId: string,
  destinationIds: readonly string[],
  region: WorkspaceSectionMoveRegion,
  targetRect: InteractionRect,
  targetSectionId: string | null,
): CollisionEntry | null {
  const area = intersectionArea(activeRect, targetRect);
  if (area <= 0) {
    return null;
  }
  return {
    candidate: {
      id: candidateId,
      intersectionArea: area,
      orientation: region.orientation,
      rect: targetRect,
      sortableContainerId: region.parentSectionId,
      triggerDistance: directionalTriggerDistance(activeRect, targetRect, region),
    },
    metadata: { candidateId, destinationIds, region, targetSectionId },
  };
}

function regionAllowsMode(
  mode: WorkspaceSectionMoveMode,
  region: WorkspaceSectionMoveRegion,
  sourceParentId: string | null,
): boolean {
  return mode === "free" || region.parentSectionId === sourceParentId;
}

function directSectionEntries({
  activeRect,
  clientRectsById,
  destinationIds,
  region,
}: Readonly<{
  activeRect: InteractionRect;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  destinationIds: readonly string[];
  region: WorkspaceSectionMoveRegion;
}>): readonly CollisionEntry[] {
  return destinationIds.flatMap((sectionId) => {
    const sectionRect = clientRectsById[sectionId];
    const visibleRect = sectionRect ? intersectionRect(sectionRect, region.clientRect) : null;
    const entry = visibleRect
      ? collisionEntry(
          activeRect,
          sectionCandidateId(sectionId),
          destinationIds,
          region,
          visibleRect,
          sectionId,
        )
      : null;
    return entry ? [entry] : [];
  });
}

function regionEntries({
  activeRect,
  clientRectsById,
  hierarchy,
  mode,
  movingIds,
  region,
  sourceParentId,
}: Readonly<{
  activeRect: InteractionRect;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  movingIds: ReadonlySet<string>;
  region: WorkspaceSectionMoveRegion;
  sourceParentId: string | null;
}>): readonly CollisionEntry[] {
  if (
    movingIds.has(region.parentSectionId) ||
    !regionAllowsMode(mode, region, sourceParentId) ||
    intersectionArea(activeRect, region.clientRect) <= 0
  ) {
    return [];
  }
  const destinationIds = (hierarchy.childrenByParent[region.parentSectionId] ?? []).filter(
    (sectionId) => !movingIds.has(sectionId),
  );
  const directEntries = directSectionEntries({
    activeRect,
    clientRectsById,
    destinationIds,
    region,
  });
  if (directEntries.length > 0) {
    return directEntries;
  }
  const entry = collisionEntry(
    activeRect,
    regionCandidateId(region.parentSectionId),
    destinationIds,
    region,
    region.clientRect,
    null,
  );
  return entry ? [entry] : [];
}

function collisionParentLookup(
  entries: readonly CollisionEntry[],
  hierarchy: SectionHierarchySnapshot,
): Readonly<Record<string, string | null>> {
  return Object.fromEntries(
    entries.map(({ metadata }) => {
      const parentId = metadata.targetSectionId
        ? (hierarchy.parentByChild[metadata.targetSectionId] ?? null)
        : metadata.region.parentSectionId;
      return [metadata.candidateId, parentId ? sectionCandidateId(parentId) : null];
    }),
  );
}

function reverseHorizontalRect(rect: InteractionRect): InteractionRect {
  return createInteractionRect(-rect.right, rect.y, rect.width, rect.height);
}

function logicalCollisionGeometry(
  activeRect: InteractionRect,
  candidate: CollisionCandidate,
  pointer: InteractionPoint | null,
  direction: WorkspaceSectionMoveDirection,
): Readonly<{
  activeRect: InteractionRect;
  candidate: CollisionCandidate;
  pointer: InteractionPoint | null;
}> {
  if (candidate.orientation !== "horizontal" || direction !== "rtl") {
    return { activeRect, candidate, pointer };
  }
  return {
    activeRect: reverseHorizontalRect(activeRect),
    candidate: { ...candidate, rect: reverseHorizontalRect(candidate.rect) },
    pointer: pointer ? { x: -pointer.x, y: pointer.y } : null,
  };
}

function destinationIndex(metadata: CollisionTargetMetadata, pastMidpoint: boolean): number | null {
  if (metadata.targetSectionId === null) {
    return pastMidpoint ? metadata.destinationIds.length : 0;
  }
  const targetIndex = metadata.destinationIds.indexOf(metadata.targetSectionId);
  return targetIndex < 0 ? null : targetIndex + Number(pastMidpoint);
}

export function resolveWorkspaceSectionCollision({
  activeRect,
  clientRectsById,
  hierarchy,
  mode,
  pointer,
  previousState,
  regions,
  sectionIds,
  sourceParentId,
}: Readonly<{
  activeRect: InteractionRect;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  pointer: InteractionPoint | null;
  previousState: CollisionTrackerState;
  regions: readonly WorkspaceSectionMoveRegion[];
  sectionIds: readonly string[];
  sourceParentId: string | null;
}>): WorkspaceSectionCollisionResolution {
  const movingIds = new Set(sectionIds);
  const entries = regions.flatMap((region) =>
    regionEntries({
      activeRect,
      clientRectsById,
      hierarchy,
      mode,
      movingIds,
      region,
      sourceParentId,
    }),
  );
  const winner = pickCollisionCandidate(
    entries.map(({ candidate }) => candidate),
    collisionParentLookup(entries, hierarchy),
    previousState.targetId,
  );
  const metadata = winner
    ? entries.find(({ metadata: current }) => current.candidateId === winner.id)?.metadata
    : undefined;
  if (!winner || !metadata) {
    return {
      collisionState: clearCollisionTarget(previousState),
      reason: "The section block is outside every measured destination.",
      target: null,
    };
  }
  const logical = logicalCollisionGeometry(activeRect, winner, pointer, metadata.region.direction);
  const collision = resolveCollisionFrame({
    activeRect: logical.activeRect,
    candidates: [logical.candidate],
    parentByChild: {},
    pointer: logical.pointer,
    previousState,
  });
  const pastMidpoint = collision.state.pastMidpoint;
  const index = pastMidpoint === null ? null : destinationIndex(metadata, pastMidpoint);
  if (index === null) {
    return {
      collisionState: clearCollisionTarget(collision.state),
      reason: "The collision target has no canonical insertion boundary.",
      target: null,
    };
  }
  return {
    collisionState: collision.state,
    reason: "",
    target: {
      destinationIndex: index,
      destinationParentId: metadata.region.parentSectionId,
      direction: metadata.region.direction,
      orientation: metadata.region.orientation,
      region: metadata.region,
      targetSectionId: metadata.targetSectionId,
    },
  };
}
