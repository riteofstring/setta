import {
  CollisionPriority,
  CollisionType,
  type CollisionDetector,
} from "@dnd-kit/abstract";
import type { Draggable, Droppable } from "@dnd-kit/dom";
import { Rectangle } from "@dnd-kit/geometry";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionInfo } from "state/actions/sectionInfos";
import { isTempSection } from "../dndState";
import type { ClientRect, SettaCollision } from "./types";

let prevCollisionId: Draggable["id"] | null = null;
let prevPastHalfway: boolean | null = null;
let prevCollisionRect: ClientRect | null = null;


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
  const activeShape = dragOperation.shape?.current;
  const droppableShape = droppable.shape;

  if (!active || !activeId || !activeShape || !droppableShape) {
    return null;
  }

  if (isTempSection(String(droppable.id))) {
    return null;
  }

  if (activeId === droppable.id) {
    return null;
  }

  const activeRect = toClientRect(activeShape.boundingRectangle);
  const droppableRect = toClientRect(droppableShape.boundingRectangle);
  const intersectionRatio = getIntersectionRatio(droppableRect, activeRect);

  if (!intersectionRatio) {
    return null;
  }

  const droppableData = getEntityData(droppable);
  const containerId = droppableData?.sortable?.containerId;
  const containerIsHorizontal = containerId
    ? Boolean(getSectionInfo(containerId)?.isHorizontalOrientation)
    : false;

  const triggerDist = containerIsHorizontal
    ? activeRect.top - droppableRect.top
    : activeRect.left - droppableRect.left;
  const absTriggerDist = Math.abs(triggerDist);

  const baseRatio =
    prevCollisionId === droppable.id ? intersectionRatio * 1.1 : intersectionRatio;

  const collisionValue = getCollisionScore({
    isSortable: Boolean(containerId),
    intersectionRatio: baseRatio,
    absTriggerDist,
  });

  const pastHalfway = getPastHalfway({
    activeRect,
    droppableRect,
    containerIsHorizontal,
    currentId: droppable.id,
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
  const activeShape = dragOperation.shape?.current;
  const droppableShape = droppable.shape;

  if (!active || !activeShape || !droppableShape) {
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

  const activeRect = toClientRect(activeShape.boundingRectangle);
  const droppableRect = toClientRect(droppableShape.boundingRectangle);
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
    return;
  }

  prevCollisionId = collisions[0].id;
  prevPastHalfway = collisions[0].pastHalfway ?? null;
  const droppableRect = collisions[0].data?.droppable?.shape?.boundingRectangle;
  prevCollisionRect = droppableRect ? toClientRect(droppableRect) : null;
}

export function resetCollisionHysteresis(): void {
  prevCollisionId = null;
  prevPastHalfway = null;
  prevCollisionRect = null;
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
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  containerIsHorizontal: boolean;
  currentId: Draggable["id"];
}): boolean {
  let buffer = 0;
  const effectiveDroppableRect =
    prevCollisionId && prevCollisionId === currentId && prevCollisionRect
      ? prevCollisionRect
      : droppableRect;

  if (prevCollisionId && prevCollisionId === currentId) {
    if (prevPastHalfway === true) {
      buffer = 10;
    } else if (prevPastHalfway === false) {
      buffer = -10;
    }
  }

  if (!containerIsHorizontal) {
    return (
      (activeRect.top + activeRect.bottom) / 2 + buffer >
      (effectiveDroppableRect.top + effectiveDroppableRect.bottom) / 2
    );
  }

  return (
    (activeRect.left + activeRect.right) / 2 + buffer >
    (effectiveDroppableRect.left + effectiveDroppableRect.right) / 2
  );
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
