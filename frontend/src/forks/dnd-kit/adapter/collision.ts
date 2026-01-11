import {
  CollisionPriority,
  CollisionType,
  type CollisionDetector,
} from "@dnd-kit/abstract";
import type { Draggable, Droppable } from "@dnd-kit/dom";
import { Rectangle, type Coordinates } from "@dnd-kit/geometry";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionInfo } from "state/actions/sectionInfos";
import { isTempSection } from "../dndState";
import type { ClientRect, SettaCollision } from "./types";

let prevCollisionId: Draggable["id"] | null = null;
let prevPastHalfway: boolean | null = null;
let prevCollisionRect: ClientRect | null = null;
let prevSortableCollisionId: Draggable["id"] | null = null;
let prevPointerX: number | null = null;
let prevPointerY: number | null = null;
let prevPointerDirectionX: number | null = null;
let prevPointerDirectionY: number | null = null;
const NEAR_MISS_THRESHOLD = 12;


type DndEntityData = {
  isTopLevel?: boolean;
  hasNested?: boolean;
  onlyChildId?: string | null;
  sortable?: {
    containerId?: string | number;
  };
};

export const customCollisionDetection: CollisionDetector = ({
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

  if (isTempSection(String(droppable.id))) {
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
  const droppableData = getEntityData(droppable);
  const containerId = droppableData?.sortable?.containerId;
  const containerIsHorizontal = containerId
    ? Boolean(getSectionInfo(containerId)?.isHorizontalOrientation)
    : false;
  const isSortable = Boolean(containerId);

  let intersectionRatio = getIntersectionRatio(droppableRect, activeRect);

  if (!intersectionRatio) {
    const nearMissRatio = getNearMissIntersectionRatio({
      activeRect,
      droppableRect,
      isSortable,
      currentId: droppable.id,
    });
    if (!nearMissRatio) {
      return null;
    }
    intersectionRatio = nearMissRatio;
  }

  const triggerDist = containerIsHorizontal
    ? activeRect.top - droppableRect.top
    : activeRect.left - droppableRect.left;
  const absTriggerDist = Math.abs(triggerDist);

  const baseRatio =
    prevCollisionId === droppable.id
      ? intersectionRatio * 1.1
      : intersectionRatio;

  const collisionValue = getCollisionScore({
    isSortable,
    intersectionRatio: baseRatio,
    absTriggerDist,
  });

  const pastHalfway = getPastHalfway({
    activeRect,
    droppableRect,
    containerIsHorizontal,
    currentId: droppable.id,
    pointerCoordinates,
  });

  const triggerDistCondition = getTriggerDistCondition({
    activeId: String(activeId),
    droppableData,
    triggerDist,
    containerIsHorizontal,
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

export const customCollisionDetectionSorting: CollisionDetector = ({
  droppable,
  dragOperation,
}) => {
  const active = dragOperation.source;
  const activeShape = dragOperation.shape?.current ?? null;
  const droppableShape = droppable.shape;

  if (!active || !droppableShape) {
    return null;
  }

  if (isTempSection(String(droppable.id))) {
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
  const containerIsHorizontal = Boolean(
    getSectionInfo(activeContainerId)?.isHorizontalOrientation,
  );

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

export function updateCollisionHysteresis(
  collisions: SettaCollision[] | null,
): void {
  if (!collisions || collisions.length === 0) {
    prevCollisionId = null;
    prevPastHalfway = null;
    prevCollisionRect = null;
    prevSortableCollisionId = null;
    return;
  }

  prevCollisionId = collisions[0].id;
  prevPastHalfway = collisions[0].pastHalfway ?? null;
  const droppableRect = collisions[0].data?.droppable?.shape?.boundingRectangle;
  prevCollisionRect = droppableRect ? toClientRect(droppableRect) : null;
  const sortableCollision = collisions.find((collision) => {
    const data = getEntityData(collision.data?.droppable ?? null);
    return Boolean(data?.sortable?.containerId);
  });
  if (sortableCollision) {
    prevSortableCollisionId = sortableCollision.id;
  }
}

export function resetCollisionHysteresis(): void {
  prevCollisionId = null;
  prevPastHalfway = null;
  prevCollisionRect = null;
  prevSortableCollisionId = null;
  prevPointerX = null;
  prevPointerY = null;
  prevPointerDirectionX = null;
  prevPointerDirectionY = null;
}

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

function getNearMissIntersectionRatio({
  activeRect,
  droppableRect,
  isSortable,
  currentId,
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  isSortable: boolean;
  currentId: Draggable["id"];
}): number | null {
  if (!isSortable || prevSortableCollisionId !== currentId) {
    return null;
  }

  const zoom = useReactFlow.getState().transform[2];
  const threshold = NEAR_MISS_THRESHOLD * zoom;
  const distance = getRectGapDistance(activeRect, droppableRect);
  if (distance > threshold) {
    return null;
  }

  const normalized = (threshold - distance) / threshold;
  return 0.001 + normalized * 0.009;
}

function getRectGapDistance(entry: ClientRect, target: ClientRect): number {
  const dx = Math.max(
    0,
    Math.max(entry.left - target.right, target.left - entry.right),
  );
  const dy = Math.max(
    0,
    Math.max(entry.top - target.bottom, target.top - entry.bottom),
  );
  return Math.hypot(dx, dy);
}

function getCollisionScore({
  isSortable,
  intersectionRatio,
  absTriggerDist,
}: {
  isSortable: boolean;
  intersectionRatio: number;
  absTriggerDist: number;
}): number {
  if (!isSortable) {
    return intersectionRatio;
  }

  return intersectionRatio * 1000 - absTriggerDist;
}

function getTriggerDistCondition({
  activeId,
  droppableData,
  triggerDist,
  containerIsHorizontal,
}: {
  activeId: string;
  droppableData: DndEntityData | null;
  triggerDist: number;
  containerIsHorizontal: boolean;
}): boolean {
  if (!droppableData) {
    return false;
  }

  if (!droppableData.hasNested) {
    return false;
  }

  if (droppableData.isTopLevel) {
    return false;
  }

  if (
    droppableData.hasNested &&
    droppableData.onlyChildId !== activeId
  ) {
    return false;
  }

  const zoom = useReactFlow.getState().transform[2];
  const threshold = containerIsHorizontal ? 20 : 100;

  return triggerDist > threshold * zoom;
}

function getPastHalfway({
  activeRect,
  droppableRect,
  containerIsHorizontal,
  currentId,
  pointerCoordinates,
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  containerIsHorizontal: boolean;
  currentId: Draggable["id"];
  pointerCoordinates: Coordinates | null;
}): boolean {
  let buffer = 0;
  const effectiveDroppableRect =
    prevCollisionId && prevCollisionId === currentId && prevCollisionRect
      ? prevCollisionRect
      : droppableRect;
  let referenceAxisValue = getFallbackReferenceAxisValue({
    activeRect,
    containerIsHorizontal,
    pointerCoordinates,
  });

  updatePointerDirections(pointerCoordinates);
  const axisDirection = containerIsHorizontal
    ? prevPointerDirectionX
    : prevPointerDirectionY;
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

  if (prevCollisionId && prevCollisionId === currentId) {
    if (prevPastHalfway === true) {
      buffer = 10;
    } else if (prevPastHalfway === false) {
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

function updatePointerDirections(pointerCoordinates: Coordinates | null): void {
  if (!pointerCoordinates) {
    return;
  }

  if (prevPointerX !== null) {
    const deltaX = pointerCoordinates.x - prevPointerX;
    if (deltaX > 0) {
      prevPointerDirectionX = 1;
    } else if (deltaX < 0) {
      prevPointerDirectionX = -1;
    }
  }

  if (prevPointerY !== null) {
    const deltaY = pointerCoordinates.y - prevPointerY;
    if (deltaY > 0) {
      prevPointerDirectionY = 1;
    } else if (deltaY < 0) {
      prevPointerDirectionY = -1;
    }
  }

  prevPointerX = pointerCoordinates.x;
  prevPointerY = pointerCoordinates.y;
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
