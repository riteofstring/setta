import type { InteractionPoint, InteractionRect } from "./interaction-geometry.js";

export type ListOrientation = "horizontal" | "vertical";

export type CollisionCandidate = {
  id: string;
  intersectionArea: number;
  orientation: ListOrientation;
  rect: InteractionRect;
  sortableContainerId: string | null;
  triggerDistance: number | null;
};

export type CollisionTrackerState = {
  pastMidpoint: boolean | null;
  pointer: InteractionPoint | null;
  pointerDirection: InteractionPoint | null;
  targetId: string | null;
  targetRect: InteractionRect | null;
};

export type CollisionResolution = {
  candidate: CollisionCandidate | null;
  state: CollisionTrackerState;
};

export const EMPTY_COLLISION_TRACKER_STATE: CollisionTrackerState = {
  pastMidpoint: null,
  pointer: null,
  pointerDirection: null,
  targetId: null,
  targetRect: null,
};

export function resolveCollisionFrame({
  activeRect,
  candidates,
  parentByChild,
  pointer,
  previousState = EMPTY_COLLISION_TRACKER_STATE,
}: {
  activeRect: InteractionRect;
  candidates: readonly CollisionCandidate[];
  parentByChild: Readonly<Record<string, string | null>>;
  pointer: InteractionPoint | null;
  previousState?: CollisionTrackerState;
}): CollisionResolution {
  const candidate = pickCollisionCandidate(candidates, parentByChild, previousState.targetId);
  if (!candidate) {
    return {
      candidate: null,
      state: {
        ...previousState,
        pastMidpoint: null,
        targetId: null,
        targetRect: null,
      },
    };
  }

  const pointerState = updatePointerState(pointer, previousState);
  const pastMidpoint = resolvePastMidpoint({
    activeRect,
    candidate,
    pointer,
    pointerDirection: pointerState.pointerDirection,
    previousState,
  });
  return {
    candidate,
    state: {
      pastMidpoint,
      pointer: pointerState.pointer,
      pointerDirection: pointerState.pointerDirection,
      targetId: candidate.id,
      targetRect: candidate.rect,
    },
  };
}

export function pickCollisionCandidate(
  candidates: readonly CollisionCandidate[],
  parentByChild: Readonly<Record<string, string | null>>,
  previousTargetId: string | null = null,
): CollisionCandidate | null {
  const first = candidates[0];
  if (!first) {
    return null;
  }

  let winner = first;
  for (const candidate of candidates.slice(1)) {
    winner = compareCandidates(winner, candidate, previousTargetId);
  }
  return promoteCollidingDescendant(winner, candidates, parentByChild);
}

function compareCandidates(
  left: CollisionCandidate,
  right: CollisionCandidate,
  previousTargetId: string | null,
): CollisionCandidate {
  const leftSortable = left.sortableContainerId !== null;
  const rightSortable = right.sortableContainerId !== null;
  if (leftSortable !== rightSortable) {
    return leftSortable ? left : right;
  }
  if (leftSortable && rightSortable) {
    const distanceWinner = compareSortableDistance(left, right);
    if (distanceWinner) {
      return distanceWinner;
    }
  }
  return effectiveIntersection(right, previousTargetId) >
    effectiveIntersection(left, previousTargetId)
    ? right
    : left;
}

function compareSortableDistance(
  left: CollisionCandidate,
  right: CollisionCandidate,
): CollisionCandidate | null {
  const leftDistance = left.triggerDistance;
  const rightDistance = right.triggerDistance;
  if (leftDistance === null || rightDistance === null) {
    return null;
  }
  const leftAbsolute = Math.abs(leftDistance);
  const rightAbsolute = Math.abs(rightDistance);
  if (leftAbsolute === rightAbsolute) {
    return null;
  }

  const priorityDifference = triggerPriority(leftDistance) - triggerPriority(rightDistance);
  if (priorityDifference !== 0) {
    return priorityDifference < 0 ? left : right;
  }
  return leftAbsolute < rightAbsolute ? left : right;
}

function triggerPriority(distance: number): number {
  if (distance < 0) {
    return 0;
  }
  return distance === 0 ? 1 : 2;
}

function effectiveIntersection(
  candidate: CollisionCandidate,
  previousTargetId: string | null,
): number {
  return candidate.id === previousTargetId
    ? candidate.intersectionArea * 1.1
    : candidate.intersectionArea;
}

function promoteCollidingDescendant(
  winner: CollisionCandidate,
  candidates: readonly CollisionCandidate[],
  parentByChild: Readonly<Record<string, string | null>>,
): CollisionCandidate {
  let promoted = winner;
  const visited = new Set([winner.id]);
  while (true) {
    const child = candidates.find((candidate) => parentByChild[candidate.id] === promoted.id);
    if (!child || visited.has(child.id)) {
      return promoted;
    }
    promoted = child;
    visited.add(child.id);
  }
}

type PointerState = Pick<CollisionTrackerState, "pointer" | "pointerDirection">;

function updatePointerState(
  pointer: InteractionPoint | null,
  previousState: CollisionTrackerState,
): PointerState {
  if (!pointer) {
    return {
      pointer: previousState.pointer,
      pointerDirection: previousState.pointerDirection,
    };
  }
  if (!previousState.pointer) {
    return { pointer, pointerDirection: previousState.pointerDirection };
  }
  return {
    pointer,
    pointerDirection: {
      x: resolveAxisDirection(
        pointer.x - previousState.pointer.x,
        previousState.pointerDirection?.x ?? 0,
      ),
      y: resolveAxisDirection(
        pointer.y - previousState.pointer.y,
        previousState.pointerDirection?.y ?? 0,
      ),
    },
  };
}

function resolveAxisDirection(delta: number, previous: number): number {
  if (delta > 0) {
    return 1;
  }
  if (delta < 0) {
    return -1;
  }
  return previous;
}

function resolvePastMidpoint({
  activeRect,
  candidate,
  pointer,
  pointerDirection,
  previousState,
}: {
  activeRect: InteractionRect;
  candidate: CollisionCandidate;
  pointer: InteractionPoint | null;
  pointerDirection: InteractionPoint | null;
  previousState: CollisionTrackerState;
}): boolean {
  const retainedRect =
    previousState.targetId === candidate.id && previousState.targetRect
      ? previousState.targetRect
      : candidate.rect;
  const axis = candidate.orientation === "horizontal" ? "x" : "y";
  const reference = resolveReferenceAxis(axis, activeRect, pointer, pointerDirection);
  const midpoint =
    axis === "x"
      ? (retainedRect.x + retainedRect.right) / 2
      : (retainedRect.y + retainedRect.bottom) / 2;
  return reference + midpointBuffer(previousState, candidate.id) > midpoint;
}

function resolveReferenceAxis(
  axis: "x" | "y",
  activeRect: InteractionRect,
  pointer: InteractionPoint | null,
  pointerDirection: InteractionPoint | null,
): number {
  const direction = pointerDirection?.[axis] ?? 0;
  if (direction > 0) {
    return axis === "x" ? activeRect.right : activeRect.bottom;
  }
  if (direction < 0) {
    return axis === "x" ? activeRect.x : activeRect.y;
  }
  if (pointer) {
    return pointer[axis];
  }
  return axis === "x"
    ? (activeRect.x + activeRect.right) / 2
    : (activeRect.y + activeRect.bottom) / 2;
}

function midpointBuffer(previousState: CollisionTrackerState, candidateId: string): number {
  if (previousState.targetId !== candidateId) {
    return 0;
  }
  if (previousState.pastMidpoint === true) {
    return 10;
  }
  return previousState.pastMidpoint === false ? -10 : 0;
}
