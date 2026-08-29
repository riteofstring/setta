import {
  CollisionPriority,
  CollisionType,
  type CollisionDetector,
} from "@dnd-kit/abstract";
import type { Draggable } from "@dnd-kit/dom";
import { Rectangle, type Coordinates, type Shape } from "@dnd-kit/geometry";
import { getReactFlowStore } from "../../canvas/store";
import { getSectionIsHorizontalOrientation } from "../../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../../document/stores";
import type { WorkspaceHost } from "../../workspaceHost";
import { isTempSection } from "../dndIds";
import { getDndStateStore } from "../dndState";
import { isTempItem } from "../itemDndState";
import { resolveOverCollision } from "./collisionCompare";
import type { ClientRect, SettaCollision } from "./types";

type CollisionMode = "section" | "item";

type ParentByChildMap = Record<string, string | null>;

type CollisionHysteresisSnapshot = {
  pastHalfway: boolean | null;
  rect: ClientRect | null;
};

type CollisionTrackerState = {
  prevCollisionId: Draggable["id"] | null;
  hysteresisByCollisionId: Map<Draggable["id"], CollisionHysteresisSnapshot>;
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
  host: WorkspaceHost;
  mode: CollisionMode;
  getParentByChild: () => ParentByChildMap;
};

type DndEntityData = {
  type?: string;
  sortableOrientation?: "horizontal" | "vertical";
  isTopLevel?: boolean;
  hasNested?: boolean;
  onlyChildId?: string | null;
  sortable?: {
    containerId?: string;
  };
};

type CollisionDetectorArgs = Parameters<CollisionDetector>[0];
type CollisionSource = NonNullable<
  CollisionDetectorArgs["dragOperation"]["source"]
>;
type CollisionDroppable = CollisionDetectorArgs["droppable"];

type SharedDetectorContext = {
  active: CollisionSource;
  droppable: CollisionDroppable;
  activeRect: ClientRect;
  droppableRect: ClientRect;
  pointerCoordinates: Coordinates | null;
};

type StandardCollisionContext = SharedDetectorContext & {
  activeId: Draggable["id"];
  activeData: DndEntityData | null;
  droppableData: DndEntityData | null;
};

type SortingCollisionContext = SharedDetectorContext & {
  activeData: DndEntityData | null;
  droppableData: DndEntityData | null;
  containerId: string;
};

type PastHalfwayReference = "directional-edge" | "pointer";

export function createCollisionTracker({
  host,
  mode,
  getParentByChild,
}: CollisionTrackerOptions): CollisionTracker {
  const state: CollisionTrackerState = {
    prevCollisionId: null,
    hysteresisByCollisionId: new Map(),
    prevPointerX: null,
    prevPointerY: null,
    prevPointerDirectionX: null,
    prevPointerDirectionY: null,
  };

  function getSharedDetectorContext({
    droppable,
    dragOperation,
  }: CollisionDetectorArgs): SharedDetectorContext | null {
    const active = dragOperation.source;
    const activeShape = dragOperation.shape?.current ?? null;
    const droppableShape = droppable.shape;

    if (!active || !droppableShape) {
      return null;
    }

    const draggingIds = getDndStateStore(host).getState().draggingIds;
    const droppableId = String(droppable.id);
    if (shouldIgnoreDroppable({ mode, droppableId, draggingIds })) {
      return null;
    }

    const activeRect = getActiveRect(activeShape);
    if (!activeRect) {
      return null;
    }

    return {
      active,
      droppable,
      activeRect,
      droppableRect: toClientRect(droppableShape.boundingRectangle),
      pointerCoordinates: dragOperation.position?.current ?? null,
    };
  }

  function getStandardCollisionContext(
    args: CollisionDetectorArgs,
  ): StandardCollisionContext | null {
    const sharedContext = getSharedDetectorContext(args);
    const activeId = args.dragOperation.source?.id;
    if (!sharedContext || !activeId || activeId === args.droppable.id) {
      return null;
    }

    return {
      ...sharedContext,
      activeId,
      activeData: getEntityData(sharedContext.active),
      droppableData: getEntityData(sharedContext.droppable),
    };
  }

  function getSortingCollisionContext(
    args: CollisionDetectorArgs,
  ): SortingCollisionContext | null {
    const sharedContext = getSharedDetectorContext(args);
    if (!sharedContext || sharedContext.active.id === args.droppable.id) {
      return null;
    }

    const activeData = getEntityData(sharedContext.active);
    const droppableData = getEntityData(sharedContext.droppable);
    const activeContainerId = activeData?.sortable?.containerId;
    const droppableContainerId = droppableData?.sortable?.containerId;
    if (!activeContainerId || activeContainerId !== droppableContainerId) {
      return null;
    }

    return {
      ...sharedContext,
      activeData,
      droppableData,
      containerId: activeContainerId,
    };
  }

  function buildStandardCollision(
    context: StandardCollisionContext,
    intersectionRatio: number,
  ): SettaCollision {
    const { active, activeRect, droppable, droppableData, droppableRect } =
      context;
    const containerId = droppableData?.sortable?.containerId;
    const containerIsHorizontal = getContainerIsHorizontal(host, {
      mode,
      containerId,
      activeData: context.activeData,
      droppableData,
    });
    const triggerDist = getTriggerDistance(
      activeRect,
      droppableRect,
      containerIsHorizontal,
    );
    const baseRatio = getBoostedIntersectionRatio({
      previousCollisionId: state.prevCollisionId,
      collisionId: droppable.id,
      intersectionRatio,
    });
    const pastHalfway = getPastHalfway({
      activeRect,
      droppableRect,
      containerIsHorizontal,
      currentId: droppable.id,
      pointerCoordinates: context.pointerCoordinates,
      reference: getPastHalfwayReference(context.activeData, droppableData),
      state,
    });

    return {
      id: droppable.id,
      priority: containerId ? CollisionPriority.High : CollisionPriority.Normal,
      type: CollisionType.Collision,
      value: getCollisionScore({
        isSortable: Boolean(containerId),
        intersectionRatio: baseRatio,
        absTriggerDist: Math.abs(triggerDist),
        triggerDist,
      }),
      data: {
        droppable,
        absTriggerDist: Math.abs(triggerDist),
        triggerDist,
        intersectionRatio: baseRatio,
      },
      pastHalfway,
      triggerDistCondition: getTriggerDistCondition(host, {
        activeId: String(active.id),
        droppableData,
        triggerDist,
        containerIsHorizontal,
        mode,
      }),
    };
  }

  function buildSortingCollision(
    context: SortingCollisionContext,
  ): SettaCollision | null {
    const { activeRect, droppable, droppableRect } = context;
    const containerIsHorizontal = getContainerIsHorizontal(host, {
      mode,
      containerId: context.containerId,
      activeData: context.activeData,
      droppableData: context.droppableData,
    });
    const distance = getEdgeDistance({
      activeRect,
      droppableRect,
      containerIsHorizontal,
    });
    if (!Number.isFinite(distance)) {
      return null;
    }

    return {
      id: droppable.id,
      priority: CollisionPriority.Normal,
      type: CollisionType.Collision,
      value: 1 / (distance + 1),
      data: {
        droppable,
        intersectionRatio: 0,
      },
      pastHalfway: getPastHalfway({
        activeRect,
        droppableRect,
        containerIsHorizontal,
        currentId: droppable.id,
        pointerCoordinates: context.pointerCoordinates,
        reference: "directional-edge",
        state,
      }),
    };
  }

  const collisionDetector: CollisionDetector = ({
    droppable,
    dragOperation,
  }) => {
    const collisionContext = getStandardCollisionContext({
      droppable,
      dragOperation,
    });
    if (!collisionContext) {
      return null;
    }

    const intersectionRatio = getResolvedIntersectionRatio({
      mode,
      activeRect: collisionContext.activeRect,
      droppableRect: collisionContext.droppableRect,
    });
    if (!intersectionRatio) {
      return null;
    }

    return buildStandardCollision(collisionContext, intersectionRatio);
  };

  const sortingCollisionDetector: CollisionDetector = ({
    droppable,
    dragOperation,
  }) => {
    const collisionContext = getSortingCollisionContext({
      droppable,
      dragOperation,
    });
    if (!collisionContext) {
      return null;
    }

    return buildSortingCollision(collisionContext);
  };

  function update(collisions: SettaCollision[] | null): void {
    setResolvedCollisionState(
      state,
      resolveCollisionCandidate(collisions, getParentByChild()),
    );
  }

  function reset(): void {
    clearResolvedCollisionState(state);
    clearPointerState(state);
  }

  return {
    collisionDetector,
    sortingCollisionDetector,
    update,
    reset,
  };
}

function getPastHalfwayReference(
  activeData: DndEntityData | null,
  droppableData: DndEntityData | null,
): PastHalfwayReference {
  const activeContainerId = activeData?.sortable?.containerId;
  const droppableContainerId = droppableData?.sortable?.containerId;
  return activeContainerId === droppableContainerId
    ? "directional-edge"
    : "pointer";
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

function getActiveRect(activeShape: Shape | null): ClientRect | null {
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

function shouldIgnoreDroppable({
  mode,
  droppableId,
  draggingIds,
}: {
  mode: CollisionMode;
  droppableId: string;
  draggingIds: Array<string>;
}): boolean {
  if (isTempSection(droppableId)) {
    return true;
  }
  if (mode === "item" && isTempItem(droppableId)) {
    return true;
  }
  return (
    mode === "section" &&
    draggingIds.length > 0 &&
    draggingIds.includes(droppableId)
  );
}

function getResolvedIntersectionRatio({
  mode,
  activeRect,
  droppableRect,
}: {
  mode: CollisionMode;
  activeRect: ClientRect;
  droppableRect: ClientRect;
}): number {
  const intersectionRatio = getIntersectionRatio(droppableRect, activeRect);
  if (intersectionRatio || mode !== "item") {
    return intersectionRatio;
  }

  const verticalOverlap = getVerticalOverlap(droppableRect, activeRect);
  if (verticalOverlap <= 0) {
    return 0;
  }

  return Number((verticalOverlap * activeRect.width).toFixed(4));
}

function getContainerIsHorizontal(
  host: WorkspaceHost,
  {
    mode,
    containerId,
    activeData,
    droppableData,
  }: {
    mode: CollisionMode;
    containerId?: string;
    activeData: DndEntityData | null;
    droppableData: DndEntityData | null;
  },
): boolean {
  if (mode !== "section") {
    return false;
  }

  const sortableOrientation =
    activeData?.sortableOrientation ?? droppableData?.sortableOrientation;
  if (sortableOrientation === "horizontal") {
    return true;
  }
  if (sortableOrientation === "vertical") {
    return false;
  }
  if (!containerId) {
    return false;
  }

  const sections = getWorkspaceDocumentStore(host).getState().sections;
  if (!(containerId in sections)) {
    return false;
  }
  return getSectionIsHorizontalOrientation(host, containerId);
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

  const clampedAbsDist = Math.min(absTriggerDist, MAX_ABS_TRIGGER_DIST);
  const distScore = -Math.round(clampedAbsDist * 1000);
  const ratioScore = Math.min(
    Math.round(intersectionRatio),
    MAX_INTERSECTION_RATIO,
  );
  const signScore = triggerDist < 0 ? 1 : 0;

  return signScore * SIGN_WEIGHT + distScore * DIST_WEIGHT + ratioScore;
}

function getTriggerDistance(
  activeRect: ClientRect,
  droppableRect: ClientRect,
  containerIsHorizontal: boolean,
): number {
  return containerIsHorizontal
    ? activeRect.top - droppableRect.top
    : activeRect.left - droppableRect.left;
}

function getBoostedIntersectionRatio({
  previousCollisionId,
  collisionId,
  intersectionRatio,
}: {
  previousCollisionId: Draggable["id"] | null;
  collisionId: Draggable["id"];
  intersectionRatio: number;
}): number {
  return previousCollisionId === collisionId
    ? intersectionRatio * 1.1
    : intersectionRatio;
}

function getTriggerDistCondition(
  host: WorkspaceHost,
  {
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
  },
): boolean {
  if (!droppableData) {
    return false;
  }

  if (droppableData.isTopLevel) {
    return false;
  }

  if (droppableData.hasNested && droppableData.onlyChildId !== activeId) {
    return false;
  }

  const zoom = getReactFlowStore(host).getState().transform[2];
  const threshold = mode === "item" ? 30 : containerIsHorizontal ? 20 : 100;

  return triggerDist > threshold * zoom;
}

function clearResolvedCollisionState(state: CollisionTrackerState): void {
  state.prevCollisionId = null;
  state.hysteresisByCollisionId.clear();
}

function clearPointerState(state: CollisionTrackerState): void {
  state.prevPointerX = null;
  state.prevPointerY = null;
  state.prevPointerDirectionX = null;
  state.prevPointerDirectionY = null;
}

function resolveCollisionCandidate(
  collisions: SettaCollision[] | null,
  parentByChild: ParentByChildMap,
): SettaCollision | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }
  return (
    resolveOverCollision(collisions, parentByChild) ?? collisions[0] ?? null
  );
}

function setResolvedCollisionState(
  state: CollisionTrackerState,
  resolvedCollision: SettaCollision | null,
): void {
  if (!resolvedCollision) {
    clearResolvedCollisionState(state);
    return;
  }

  state.prevCollisionId = resolvedCollision.id;
  const previousSnapshot = state.hysteresisByCollisionId.get(
    resolvedCollision.id,
  );
  state.hysteresisByCollisionId.set(
    resolvedCollision.id,
    getNextHysteresisSnapshot(resolvedCollision, previousSnapshot),
  );
}

function getNextHysteresisSnapshot(
  resolvedCollision: SettaCollision,
  previousSnapshot: CollisionHysteresisSnapshot | undefined,
): CollisionHysteresisSnapshot {
  return {
    pastHalfway:
      resolvedCollision.pastHalfway ?? previousSnapshot?.pastHalfway ?? null,
    rect: previousSnapshot?.rect ?? getCollisionRect(resolvedCollision),
  };
}

function getCollisionRect(collision: SettaCollision): ClientRect | null {
  const shape = collision.data?.droppable?.shape;
  return shape ? toClientRect(shape.boundingRectangle) : null;
}

function getPastHalfway({
  activeRect,
  droppableRect,
  containerIsHorizontal,
  currentId,
  pointerCoordinates,
  reference,
  state,
}: {
  activeRect: ClientRect;
  droppableRect: ClientRect;
  containerIsHorizontal: boolean;
  currentId: Draggable["id"];
  pointerCoordinates: Coordinates | null;
  reference: PastHalfwayReference;
  state: CollisionTrackerState;
}): boolean {
  const effectiveDroppableRect = getEffectiveDroppableRect({
    currentId,
    droppableRect,
    state,
  });
  updatePointerDirections(pointerCoordinates, state);
  const axisDirection = getPointerAxisDirection(state, containerIsHorizontal);
  const referenceAxisValue = getReferenceAxisValue({
    activeRect,
    containerIsHorizontal,
    pointerCoordinates,
    reference,
    axisDirection,
  });
  const buffer = getPastHalfwayBuffer(state, currentId);
  const midpoint = getAxisMidpoint(
    effectiveDroppableRect,
    containerIsHorizontal,
  );
  const pastHalfway = referenceAxisValue + buffer > midpoint;
  return pastHalfway;
}

function getEffectiveDroppableRect({
  currentId,
  droppableRect,
  state,
}: {
  currentId: Draggable["id"];
  droppableRect: ClientRect;
  state: CollisionTrackerState;
}): ClientRect {
  return state.hysteresisByCollisionId.get(currentId)?.rect ?? droppableRect;
}

function getPointerAxisDirection(
  state: CollisionTrackerState,
  containerIsHorizontal: boolean,
): number | null {
  return containerIsHorizontal
    ? state.prevPointerDirectionX
    : state.prevPointerDirectionY;
}

function getReferenceAxisValue({
  activeRect,
  containerIsHorizontal,
  pointerCoordinates,
  reference,
  axisDirection,
}: {
  activeRect: ClientRect;
  containerIsHorizontal: boolean;
  pointerCoordinates: Coordinates | null;
  reference: PastHalfwayReference;
  axisDirection: number | null;
}): number {
  if (reference === "pointer") {
    if (pointerCoordinates) {
      return containerIsHorizontal
        ? pointerCoordinates.x
        : pointerCoordinates.y;
    }
    return containerIsHorizontal
      ? (activeRect.left + activeRect.right) / 2
      : (activeRect.top + activeRect.bottom) / 2;
  }
  const pointerEdgeValue = getPointerEdgeValue({
    activeRect,
    containerIsHorizontal,
    axisDirection,
  });
  if (pointerEdgeValue !== null) {
    return pointerEdgeValue;
  }
  return getFallbackReferenceAxisValue({
    activeRect,
    containerIsHorizontal,
    pointerCoordinates,
  });
}

function getPointerEdgeValue({
  activeRect,
  containerIsHorizontal,
  axisDirection,
}: {
  activeRect: ClientRect;
  containerIsHorizontal: boolean;
  axisDirection: number | null;
}): number | null {
  if (axisDirection === null) {
    return null;
  }
  if (containerIsHorizontal) {
    return axisDirection > 0 ? activeRect.right : activeRect.left;
  }
  return axisDirection > 0 ? activeRect.bottom : activeRect.top;
}

function getPastHalfwayBuffer(
  state: CollisionTrackerState,
  currentId: Draggable["id"],
): number {
  const previousPastHalfway =
    state.hysteresisByCollisionId.get(currentId)?.pastHalfway;
  if (previousPastHalfway === true) {
    return 10;
  }
  if (previousPastHalfway === false) {
    return -10;
  }
  return 0;
}

function getAxisMidpoint(
  rect: ClientRect,
  containerIsHorizontal: boolean,
): number {
  return containerIsHorizontal
    ? (rect.left + rect.right) / 2
    : (rect.top + rect.bottom) / 2;
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
    Math.abs((activeEdges[0] ?? 0) - (targetEdges[0] ?? 0)) +
    Math.abs((activeEdges[1] ?? 0) - (targetEdges[1] ?? 0))
  );
}
