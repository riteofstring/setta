import type { SettaCollision } from "./types";

type CollisionSortableData = {
  sortable?: {
    containerId?: string | number;
  };
};

type CollisionDroppableData = {
  current?: CollisionSortableData;
};

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

function getCollisionIntersectionRatio(collision: SettaCollision | null): number {
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

export function compareCollisions(
  a: SettaCollision | null,
  b: SettaCollision | null,
): SettaCollision | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  const containerIdA = getCollisionSortableContainerId(a);
  const containerIdB = getCollisionSortableContainerId(b);
  if (containerIdA && !containerIdB) {
    return a;
  }
  if (!containerIdA && containerIdB) {
    return b;
  }

  const ratioA = getCollisionIntersectionRatio(a);
  const ratioB = getCollisionIntersectionRatio(b);

  if (containerIdA && containerIdB) {
    const absDistA = getCollisionAbsTriggerDist(a);
    const absDistB = getCollisionAbsTriggerDist(b);
    const rawDistA = getCollisionTriggerDist(a);
    const rawDistB = getCollisionTriggerDist(b);

    if (
      absDistA !== null &&
      absDistB !== null &&
      rawDistA !== null &&
      rawDistB !== null
    ) {
      if (absDistA - absDistB === 0) {
        return ratioB - ratioA > 0 ? b : a;
      }

      if (rawDistA > 0 && rawDistB > 0) {
        return absDistA - absDistB > 0 ? b : a;
      }

      if (absDistA - absDistB > 0) {
        return rawDistB < 0 ? b : a;
      }

      if (absDistB - absDistA > 0) {
        return rawDistA < 0 ? a : b;
      }
    }
  }

  return ratioB - ratioA > 0 ? b : a;
}

export function pickBestCollision(
  collisions: SettaCollision[] | null,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  let bestCollision: SettaCollision | null = null;
  for (const collision of collisions) {
    bestCollision = compareCollisions(bestCollision, collision);
  }

  return bestCollision;
}

export function promoteBestCollision(
  collisions: SettaCollision[] | null,
): SettaCollision[] {
  if (!collisions || collisions.length === 0) {
    return [];
  }

  const bestCollision = pickBestCollision(collisions);
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
