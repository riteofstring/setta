import {
  CollisionPriority,
  CollisionType,
  type CollisionDetector,
} from "@dnd-kit/abstract";
import type { Draggable } from "@dnd-kit/dom";
import { Rectangle, type Coordinates } from "@dnd-kit/geometry";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionIsHorizontalOrientation } from "state/actions/sectionInfos";
import { useDndChildren } from "../dndChildren";
import { isTempSection } from "../dndState";
import { isTempParam } from "../paramDndState";
import { resolveOverCollision } from "./collisionCompare";
import type { ClientRect, SettaCollision } from "./types";

type CollisionMode = "section" | "param";

type ParentByChildMap = Record<string, string | null>;

type CollisionTrackerState = {
  prevCollisionId: Draggable["id"] | null;
  prevPastHalfway: boolean | null;
  prevCollisionRect: ClientRect | null;
  prevPointerX: number | null;
  prevPointerY: number | null;
  prevPointerDirectionX: number | null;
  prevPointerDirectionY: number | null;
};

export type CollisionTracker = {
  collisionDetector: CollisionDetector;
  sortingCollisionDetector: CollisionDetector;
  update: (collisions: SettaCollision[] | null) => void;
  reset: () => void;
};

type CollisionTrackerOptions = {
  mode: CollisionMode;
  getParentByChild: () => ParentByChildMap;
};

type DndEntityData = {
  type?: string;
  isTopLevel?: boolean;
  hasNested?: boolean;
  onlyChildId?: string | null;
  sortable?: {
    containerId?: string;
  };
};

export function createCollisionTracker({
  mode,
  getParentByChild,
}: CollisionTrackerOptions): CollisionTracker {
  const state: CollisionTrackerState = {
    prevCollisionId: null,
    prevPastHalfway: null,
    prevCollisionRect: null,
    prevPointerX: null,
    prevPointerY: null,
    prevPointerDirectionX: null,
    prevPointerDirectionY: null,
  };

  const collisionDetector: CollisionDetector = ({
    droppable,
    dragOperation,
  }) => {
    const active = dragOperation.source;
    const activeId = active?.id;
    const activeShape = dragOperation.shape?.current ?? null;
    const droppableShape = droppable.shape;

    if (!active || !activeId || !droppableShape) {
      return null;
    }

    if (
      isTempSection(String(droppable.id)) ||
      (mode === "param" && isTempParam(String(droppable.id)))
    ) {
      return null;
    }

    if (activeId === droppable.id) {
      return null;
    }

    const activeRect = getActiveRect(activeShape);
    if (!activeRect) {
      return null;
    }
    const droppableRect = toClientRect(droppableShape.boundingRectangle);
    const pointerCoordinates = dragOperation.position?.current ?? null;
    let intersectionRatio = getIntersectionRatio(droppableRect, activeRect);

    if (!intersectionRatio && mode === "param") {
      const verticalOverlap = getVerticalOverlap(droppableRect, activeRect);
      if (verticalOverlap > 0) {
        // Keep param collisions alive when dragging horizontally outside the row.
        intersectionRatio = Number(
          (verticalOverlap * activeRect.width).toFixed(4),
        );
      }
    }

    if (!intersectionRatio) {
      return null;
    }

    const droppableData = getEntityData(droppable);
    const containerId = droppableData?.sortable?.containerId;
    const containerIsHorizontal =
      mode === "section" && containerId
        ? getSectionIsHorizontalOrientation(containerId)
        : false;

    const triggerDist = containerIsHorizontal
      ? activeRect.top - droppableRect.top
      : activeRect.left - droppableRect.left;
    const absTriggerDist = Math.abs(triggerDist);

    const baseRatio =
      state.prevCollisionId === droppable.id
        ? intersectionRatio * 1.1
        : intersectionRatio;

    const collisionValue = getCollisionScore({
      isSortable: Boolean(containerId),
      intersectionRatio: baseRatio,
      absTriggerDist,
      triggerDist,
    });

    const pastHalfway = getPastHalfway({
      activeRect,
      droppableRect,
      containerIsHorizontal,
      currentId: droppable.id,
      pointerCoordinates,
      state,
    });

    const triggerDistCondition = getTriggerDistCondition({
      activeId: String(activeId),
      droppableData,
      triggerDist,
      containerIsHorizontal,
      mode,
    });

    const collision: SettaCollision = {
      id: droppable.id,
      priority: containerId ? CollisionPriority.High : CollisionPriority.Normal,
      type: CollisionType.Collision,
      value: collisionValue,
      data: {
        droppable,
        absTriggerDist,
        triggerDist,
        intersectionRatio: baseRatio,
      },
      pastHalfway,
      triggerDistCondition,
    };

    return collision;
  };

  const sortingCollisionDetector: CollisionDetector = ({
    droppable,
    dragOperation,
  }) => {
    const active = dragOperation.source;
    const activeShape = dragOperation.shape?.current ?? null;
    const droppableShape = droppable.shape;

    if (!active || !droppableShape) {
      return null;
    }

    if (
      isTempSection(String(droppable.id)) ||
      (mode === "param" && isTempParam(String(droppable.id)))
    ) {
      return null;
    }

    const activeData = getEntityData(active);
    const droppableData = getEntityData(droppable);
    const activeContainerId = activeData?.sortable?.containerId;
    const droppableContainerId = droppableData?.sortable?.containerId;

    if (!activeContainerId || !droppableContainerId) {
      return null;
    }

    if (activeContainerId !== droppableContainerId) {
      return null;
    }

    if (active.id === droppable.id) {
      return null;
    }

    const activeRect = getActiveRect(activeShape);
    if (!activeRect) {
      return null;
    }
    const droppableRect = toClientRect(droppableShape.boundingRectangle);
    const pointerCoordinates = dragOperation.position?.current ?? null;
    const containerIsHorizontal =
      mode === "section"
        ? Boolean(getSectionIsHorizontalOrientation(activeContainerId))
        : false;

    const distance = getEdgeDistance({
      activeRect,
      droppableRect,
      containerIsHorizontal,
    });

    if (!Number.isFinite(distance)) {
      return null;
    }

    const pastHalfway = getPastHalfway({
      activeRect,
      droppableRect,
      containerIsHorizontal,
      currentId: droppable.id,
      pointerCoordinates,
      state,
    });

    const collision: SettaCollision = {
      id: droppable.id,
      priority: CollisionPriority.Normal,
      type: CollisionType.Collision,
      value: 1 / (distance + 1),
      data: {
        droppable,
        intersectionRatio: 0,
      },
      pastHalfway,
    };

    return collision;
  };

  function update(collisions: SettaCollision[] | null): void {
    if (!collisions || collisions.length === 0) {
      state.prevCollisionId = null;
      state.prevPastHalfway = null;
      state.prevCollisionRect = null;
      return;
    }

    const parentByChild = getParentByChild();
    let resolvedCollision = resolveOverCollision(collisions, parentByChild);
    if (!resolvedCollision) {
      resolvedCollision = collisions[0] ?? null;
    }
    if (!resolvedCollision) {
      state.prevCollisionId = null;
      state.prevPastHalfway = null;
      state.prevCollisionRect = null;
      return;
    }
    state.prevCollisionId = resolvedCollision.id;
    state.prevPastHalfway = resolvedCollision.pastHalfway ?? null;
    const droppableRect =
      resolvedCollision.data?.droppable?.shape?.boundingRectangle;
    state.prevCollisionRect = droppableRect
      ? toClientRect(droppableRect)
      : null;
  }

  function reset(): void {
    state.prevCollisionId = null;
    state.prevPastHalfway = null;
    state.prevCollisionRect = null;
    state.prevPointerX = null;
    state.prevPointerY = null;
    state.prevPointerDirectionX = null;
    state.prevPointerDirectionY = null;
  }

  return {
    collisionDetector,
    sortingCollisionDetector,
    update,
    reset,
  };
}

export const defaultCollisionTracker = createCollisionTracker({
  mode: "section",
  getParentByChild: () => useDndChildren.getState().y,
});

function toClientRect(rect: Rectangle["boundingRectangle"]): ClientRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getActiveRect(activeShape: Rectangle | null): ClientRect | null {
  if (!activeShape) {
    return null;
  }

  return toClientRect(activeShape.boundingRectangle);
}

function getEntityData(entity: { data?: Record<string, unknown> } | null) {
  if (!entity || !entity.data) {
    return null;
  }

  const wrapped = entity.data as { current?: DndEntityData };
  return wrapped.current ?? null;
}

function getIntersectionRatio(entry: ClientRect, target: ClientRect): number {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  const width = right - left;
  const height = bottom - top;

  if (left < right && top < bottom) {
    const intersectionArea = width * height;
    return Number(intersectionArea.toFixed(4));
  }

  return 0;
}

function getVerticalOverlap(entry: ClientRect, target: ClientRect): number {
  const top = Math.max(target.top, entry.top);
  const bottom = Math.min(target.bottom, entry.bottom);
  return bottom - top;
}

const MAX_ABS_TRIGGER_DIST = 10000;
const MAX_INTERSECTION_RATIO = 1_000_000;
const SIGN_WEIGHT = 1_000_000_000_000_000;
const DIST_WEIGHT = MAX_INTERSECTION_RATIO + 1;

function getCollisionScore({
  isSortable,
  intersectionRatio,
  absTriggerDist,
  triggerDist,
}: {
  isSortable: boolean;
  intersectionRatio: number;
  absTriggerDist: number;
  triggerDist: number;
}): number {
  if (!isSortable) {
    return intersectionRatio;
  }

  // Keep ordering aligned with compareCollisions: prefer rawDist < 0 when sides differ,
  // otherwise favor smaller abs distance with intersection as tie-breaker.
  const clampedAbsDist = Math.min(absTriggerDist, MAX_ABS_TRIGGER_DIST);
  const distScore = -Math.round(clampedAbsDist * 1000);
  const ratioScore = Math.min(
    Math.round(intersectionRatio),
    MAX_INTERSECTION_RATIO,
  );
  const signScore = triggerDist < 0 ? 1 : 0;

  return signScore * SIGN_WEIGHT + distScore * DIST_WEIGHT + ratioScore;
}

function getTriggerDistCondition({
  activeId,
  droppableData,
  triggerDist,
  containerIsHorizontal,
  mode,
}: {
  activeId: string;
  droppableData: DndEntityData | null;
  triggerDist: number;
  containerIsHorizontal: boolean;
  mode: CollisionMode;
}): boolean {
  if (!droppableData) {
    return false;
  }

  if (droppableData.isTopLevel) {
    return false;
  }

  if (droppableData.hasNested && droppableData.onlyChildId !== activeId) {
    return false;
  }

  const zoom = useReactFlow.getState().transform[2];
  const threshold = mode === "param" ? 30 : containerIsHorizontal ? 20 : 100;

  return triggerDist > threshold * zoom;
}

function getPastHalfway({
  activeRect,
  droppableRect,
  containerIsHorizontal,
  currentId,
  pointerCoordinates,
  state,
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  containerIsHorizontal: boolean;
  currentId: Draggable["id"];
  pointerCoordinates: Coordinates | null;
  state: CollisionTrackerState;
}): boolean {
  let buffer = 0;
  const effectiveDroppableRect =
    state.prevCollisionId &&
    state.prevCollisionId === currentId &&
    state.prevCollisionRect
      ? state.prevCollisionRect
      : droppableRect;
  let referenceAxisValue = getFallbackReferenceAxisValue({
    activeRect,
    containerIsHorizontal,
    pointerCoordinates,
  });

  updatePointerDirections(pointerCoordinates, state);
  const axisDirection = containerIsHorizontal
    ? state.prevPointerDirectionX
    : state.prevPointerDirectionY;
  if (axisDirection !== null) {
    if (axisDirection > 0) {
      referenceAxisValue = containerIsHorizontal
        ? activeRect.right
        : activeRect.bottom;
    } else {
      referenceAxisValue = containerIsHorizontal
        ? activeRect.left
        : activeRect.top;
    }
  }

  if (state.prevCollisionId && state.prevCollisionId === currentId) {
    if (state.prevPastHalfway === true) {
      buffer = 10;
    } else if (state.prevPastHalfway === false) {
      buffer = -10;
    }
  }

  if (!containerIsHorizontal) {
    return (
      referenceAxisValue + buffer >
      (effectiveDroppableRect.top + effectiveDroppableRect.bottom) / 2
    );
  }

  return (
    referenceAxisValue + buffer >
    (effectiveDroppableRect.left + effectiveDroppableRect.right) / 2
  );
}

function updatePointerDirections(
  pointerCoordinates: Coordinates | null,
  state: CollisionTrackerState,
): void {
  if (!pointerCoordinates) {
    return;
  }

  if (state.prevPointerX !== null) {
    const deltaX = pointerCoordinates.x - state.prevPointerX;
    if (deltaX > 0) {
      state.prevPointerDirectionX = 1;
    } else if (deltaX < 0) {
      state.prevPointerDirectionX = -1;
    }
  }

  if (state.prevPointerY !== null) {
    const deltaY = pointerCoordinates.y - state.prevPointerY;
    if (deltaY > 0) {
      state.prevPointerDirectionY = 1;
    } else if (deltaY < 0) {
      state.prevPointerDirectionY = -1;
    }
  }

  state.prevPointerX = pointerCoordinates.x;
  state.prevPointerY = pointerCoordinates.y;
}

function getFallbackReferenceAxisValue({
  activeRect,
  containerIsHorizontal,
  pointerCoordinates,
}: {
  activeRect: ClientRect;
  containerIsHorizontal: boolean;
  pointerCoordinates: Coordinates | null;
}): number {
  if (pointerCoordinates) {
    if (containerIsHorizontal) {
      return pointerCoordinates.x;
    }
    return pointerCoordinates.y;
  }

  if (containerIsHorizontal) {
    return (activeRect.left + activeRect.right) / 2;
  }

  return (activeRect.top + activeRect.bottom) / 2;
}

function getEdgeDistance({
  activeRect,
  droppableRect,
  containerIsHorizontal,
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  containerIsHorizontal: boolean;
}): number {
  const activeEdges = containerIsHorizontal
    ? [activeRect.left, activeRect.left + activeRect.width]
    : [activeRect.top, activeRect.top + activeRect.height];
  const targetEdges = containerIsHorizontal
    ? [droppableRect.left, droppableRect.left + droppableRect.width]
    : [droppableRect.top, droppableRect.top + droppableRect.height];

  return (
    Math.abs(activeEdges[0] - targetEdges[0]) +
    Math.abs(activeEdges[1] - targetEdges[1])
  );
}
