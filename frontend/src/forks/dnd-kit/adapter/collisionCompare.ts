import type { SettaCollision } from "./types";

type CollisionSortableData = {
  sortable?: {
    containerId?: string | number;
  };
};

type CollisionDroppableData = {
  current?: CollisionSortableData;
};

type ChildParentMap = Record<string, string | null>;
type SortableDistanceMetrics = {
  absDist: number;
  rawDist: number;
};

const EMPTY_CHILD_PARENT_MAP: ChildParentMap = {};

function getCollisionSortableContainerId(
  collision: SettaCollision | null,
): string | number | null {
  if (!collision) {
    return null;
  }

  const droppableData = collision.data?.droppable?.data as
    | CollisionDroppableData
    | undefined;
  const containerId = droppableData?.current?.sortable?.containerId;
  return containerId ?? null;
}

function getCollisionNumber(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function getCollisionIntersectionRatio(
  collision: SettaCollision | null,
): number {
  const value = collision?.data?.intersectionRatio;
  const resolved = getCollisionNumber(value);
  if (resolved === null) {
    return 0;
  }

  return resolved;
}

function getCollisionAbsTriggerDist(
  collision: SettaCollision | null,
): number | null {
  const value = collision?.data?.absTriggerDist;
  return getCollisionNumber(value);
}

function getCollisionTriggerDist(
  collision: SettaCollision | null,
): number | null {
  const value = collision?.data?.triggerDist;
  return getCollisionNumber(value);
}

function hasSortableContainer(collision: SettaCollision | null): boolean {
  return Boolean(getCollisionSortableContainerId(collision));
}

function getSortableDistanceMetrics(
  collision: SettaCollision | null,
): SortableDistanceMetrics | null {
  const absDist = getCollisionAbsTriggerDist(collision);
  const rawDist = getCollisionTriggerDist(collision);
  if (absDist === null || rawDist === null) {
    return null;
  }

  return { absDist, rawDist };
}

function pickHigherRatioCollision(
  a: SettaCollision,
  b: SettaCollision,
): SettaCollision {
  return getCollisionIntersectionRatio(b) > getCollisionIntersectionRatio(a)
    ? b
    : a;
}

function pickSortableDistanceCollision(
  a: SettaCollision,
  b: SettaCollision,
): SettaCollision | null {
  const metricsA = getSortableDistanceMetrics(a);
  const metricsB = getSortableDistanceMetrics(b);
  if (!metricsA || !metricsB) {
    return null;
  }

  if (metricsA.absDist === metricsB.absDist) {
    return null;
  }

  const priorityA = getSortableTriggerPriority(metricsA.rawDist);
  const priorityB = getSortableTriggerPriority(metricsB.rawDist);
  if (priorityA !== priorityB) {
    return priorityA < priorityB ? a : b;
  }

  return metricsA.absDist < metricsB.absDist ? a : b;
}

function getSortableTriggerPriority(rawDist: number): number {
  if (rawDist < 0) {
    return 0;
  }
  if (rawDist === 0) {
    return 1;
  }
  return 2;
}

function getChildCollisionForParent(
  collisions: SettaCollision[] | null,
  parentCollision: SettaCollision | null,
  parentByChild: ChildParentMap,
): SettaCollision | null {
  if (!parentCollision) {
    return null;
  }

  return getChildCollisionForParentId(
    collisions,
    parentCollision.id,
    parentByChild,
  );
}

function getChildCollisionForParentId(
  collisions: SettaCollision[] | null,
  parentId: string | number,
  parentByChild: ChildParentMap,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  const parentIdKey = String(parentId);
  for (const collision of collisions) {
    const collisionId = String(collision.id);
    if (parentByChild[collisionId] === parentIdKey) {
      return collision;
    }
  }

  return null;
}

function compareCollisions(
  a: SettaCollision | null,
  b: SettaCollision | null,
): SettaCollision | null {
  if (!a || !b) {
    return a ?? b;
  }

  const hasSortableContainerA = hasSortableContainer(a);
  const hasSortableContainerB = hasSortableContainer(b);
  if (hasSortableContainerA !== hasSortableContainerB) {
    return hasSortableContainerA ? a : b;
  }

  if (hasSortableContainerA && hasSortableContainerB) {
    const sortableDistanceWinner = pickSortableDistanceCollision(a, b);
    if (sortableDistanceWinner) {
      return sortableDistanceWinner;
    }
  }

  return pickHigherRatioCollision(a, b);
}

function pickBestCollision(
  collisions: SettaCollision[] | null,
  parentByChild: ChildParentMap,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  let bestCollision: SettaCollision | null = null;
  for (const collision of collisions) {
    bestCollision = compareCollisions(bestCollision, collision);
  }

  const childCollision = getChildCollisionForParent(
    collisions,
    bestCollision,
    parentByChild,
  );
  return childCollision ?? bestCollision;
}

export function resolveOverCollision(
  collisions: SettaCollision[] | null,
  parentByChild: ChildParentMap = EMPTY_CHILD_PARENT_MAP,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  const baseCollision =
    pickBestCollision(collisions, parentByChild) ?? collisions[0] ?? null;
  if (!baseCollision) {
    return null;
  }

  const childCollision = getChildCollisionForParentId(
    collisions,
    baseCollision.id,
    parentByChild,
  );
  return childCollision ?? baseCollision;
}

export function resolveOverCollisionId(
  collisions: SettaCollision[] | null,
  fallbackId: string | number | null,
  parentByChild: ChildParentMap = EMPTY_CHILD_PARENT_MAP,
): string | number | null {
  const resolvedCollision = resolveOverCollision(collisions, parentByChild);
  if (resolvedCollision) {
    return resolvedCollision.id;
  }

  return fallbackId;
}

export function promoteBestCollision(
  collisions: SettaCollision[] | null,
  parentByChild: ChildParentMap = EMPTY_CHILD_PARENT_MAP,
): SettaCollision[] {
  if (!collisions || collisions.length === 0) {
    return [];
  }

  const bestCollision = resolveOverCollision(collisions, parentByChild);
  if (!bestCollision) {
    return collisions.slice();
  }

  const reordered = collisions.slice();
  const bestIndex = reordered.indexOf(bestCollision);
  if (bestIndex <= 0) {
    return reordered;
  }

  reordered.splice(bestIndex, 1);
  reordered.unshift(bestCollision);
  return reordered;
}
