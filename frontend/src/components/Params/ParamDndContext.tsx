import { PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { arrayMove } from "@dnd-kit/helpers";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";
import {
  computeNewIndex,
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  moveParamsWithBackend,
  orderParamIdsByParent,
  selectOnlyParam,
} from "state/actions/params/moveParams";
import { logParamReorder } from "state/actions/params/paramReorderDebug";
import {
  getRootSelectedParamIds,
  getSharedParentId,
  isDescendantOfSelection,
  resolveFullIndexForVisibleInsertion,
  type ParamTreeView,
} from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

const INDENT_WIDTH = 16;

type ParamDndProjection = {
  parentId: string;
  depth: number;
  targetVisibleIndex: number;
};

type ParamDndState = {
  activeId: string | null;
  overId: string | null;
  overPastHalfway: boolean | null;
  projection: ParamDndProjection | null;
  draggingIds: string[];
  isDropValid: boolean;
  enabled: boolean;
  indentWidth: number;
};

const ParamDndContext = createContext<ParamDndState | null>(null);

export function useParamDndState() {
  return useContext(ParamDndContext);
}

export function ParamDndProvider({
  sectionId,
  tree,
  enabled,
  children,
}: {
  sectionId: string;
  tree: ParamTreeView;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPastHalfway, setOverPastHalfway] = useState<boolean | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  useEffect(() => {
    logParamReorder("param dnd enabled", { sectionId, enabled });
  }, [enabled, sectionId]);

  const sensors = useMemo(() => {
    const pointerSensor = PointerSensor.configure({
      // Require a small move so click-to-select doesn't immediately drag.
      activationConstraints: () => [
        new PointerActivationConstraints.Distance({ value: 5 }),
      ],
      // Allow drag activation from inputs while param selection mode is active.
      preventActivation: () => false,
    });
    return [pointerSensor];
  }, []);

  const draggingSet = useMemo(() => new Set(draggingIds), [draggingIds]);
  const projection = useMemo(() => {
    if (!activeId || !overId) {
      return null;
    }
    const projected = getProjection({
      flatItems: tree.flat,
      activeId,
      overId,
      overPastHalfway,
      offsetX: dragOffset,
      indentWidth: INDENT_WIDTH,
      rootId: tree.rootId,
    });
    if (!projected) {
      return null;
    }
    const targetVisibleIndex = getTargetVisibleIndex({
      flatItems: tree.flat,
      activeId,
      overId,
      overPastHalfway,
      parentId: projected.parentId,
      depth: projected.depth,
      draggingSet,
    });
    if (targetVisibleIndex === null) {
      return null;
    }
    return {
      parentId: projected.parentId,
      depth: projected.depth,
      targetVisibleIndex,
    };
  }, [
    activeId,
    dragOffset,
    overId,
    overPastHalfway,
    tree.flat,
    tree.rootId,
    draggingSet,
  ]);

  const isDropValid = useMemo(() => {
    if (!projection) {
      return false;
    }
    if (!(projection.parentId in tree.parentById)) {
      return false;
    }
    if (
      isDescendantOfSelection(tree.parentById, projection.parentId, draggingSet)
    ) {
      return false;
    }
    return true;
  }, [projection, tree.parentById, draggingSet]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!enabled) {
        logParamReorder("drag start ignored", { sectionId, reason: "disabled" });
        return;
      }
      const nextActiveId = String(event.active.id);
      setActiveId(nextActiveId);
      setOverId(nextActiveId);
      setOverPastHalfway(null);
      setDragOffset(0);

      const state = useProjectState.getState();
      const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
        state,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const selectedParams = sectionImpl.selectedParams ?? [];
      const rootSelected = getRootSelectedParamIds(
        tree.parentById,
        selectedParams,
      );
      const isActiveSelected = selectedParams.includes(nextActiveId);
      let nextDraggingIds = isActiveSelected ? rootSelected : [nextActiveId];

      if (!isActiveSelected) {
        selectOnlyParam(sectionId, nextActiveId);
      }

      const sharedParent = getSharedParentId(tree.parentById, nextDraggingIds);
      if (!sharedParent && nextDraggingIds.length > 1) {
        addTemporaryNotification("Param selection spans multiple parents.");
        nextDraggingIds = [nextActiveId];
        selectOnlyParam(sectionId, nextActiveId);
      }

      logParamReorder("drag start", {
        sectionId,
        activeId: nextActiveId,
        selectedParams,
        rootSelected,
        draggingIds: nextDraggingIds,
        sharedParent,
      });
      setDraggingIds(nextDraggingIds);
    },
    [enabled, sectionId, tree.parentById],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!enabled) {
        return;
      }
      const resolvedOverId = resolveOverCollisionId(
        event.collisions ?? null,
        event.over ? event.over.id : null,
      );
      const nextOverId = resolvedOverId ? String(resolvedOverId) : null;
      setOverId((prev) => (prev === nextOverId ? prev : nextOverId));
      const nextPastHalfway = getPastHalfwayFromCollisions(
        event.collisions ?? null,
        resolvedOverId,
      );
      setOverPastHalfway((prev) =>
        prev === nextPastHalfway ? prev : nextPastHalfway,
      );
    },
    [enabled],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!enabled) {
        return;
      }
      setDragOffset(event.delta.x);
      const resolvedOverId = resolveOverCollisionId(
        event.collisions ?? null,
        event.over ? event.over.id : null,
      );
      const nextOverId = resolvedOverId ? String(resolvedOverId) : null;
      setOverId((prev) => (prev === nextOverId ? prev : nextOverId));
      const nextPastHalfway = getPastHalfwayFromCollisions(
        event.collisions ?? null,
        resolvedOverId,
      );
      setOverPastHalfway((prev) =>
        prev === nextPastHalfway ? prev : nextPastHalfway,
      );
    },
    [enabled],
  );

  const resetDragState = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setOverPastHalfway(null);
    setDragOffset(0);
    setDraggingIds([]);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!enabled) {
        logParamReorder("drag end ignored", { sectionId, reason: "disabled" });
        resetDragState();
        return;
      }
      if (
        event.canceled ||
        !projection ||
        !isDropValid ||
        draggingIds.length === 0
      ) {
        logParamReorder("drag end aborted", {
          sectionId,
          canceled: event.canceled,
          projection,
          isDropValid,
          draggingIds,
        });
        resetDragState();
        return;
      }
      const newParentId = projection.parentId;
      const state = useProjectState.getState();
      const parentId =
        getSharedParentId(tree.parentById, draggingIds) ??
        tree.parentById[draggingIds[0]] ??
        null;
      const orderedDraggingIds = parentId
        ? orderParamIdsByParent(state, sectionId, parentId, draggingIds)
        : draggingIds;
      if (orderedDraggingIds.length === 0) {
        resetDragState();
        return;
      }
      const newParentImpl = getCurrEffectiveCodeObjImpl(
        state,
        sectionId,
        newParentId,
      );
      const fullChildren = isBaseParentCodeObjImpl(newParentImpl)
        ? newParentImpl.children
        : [];
      const visibleSiblings = tree.visibleChildrenByParent[newParentId] ?? [];
      const newIndex = resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: projection.targetVisibleIndex,
        movingIds: new Set(orderedDraggingIds),
        visibleSiblings,
        fullChildren,
      });
      if (newIndex === null) {
        logParamReorder("drag end missing index", {
          sectionId,
          newParentId,
          orderedDraggingIds,
          projection,
        });
        resetDragState();
        return;
      }
      logParamReorder("drag end commit", {
        sectionId,
        orderedDraggingIds,
        newParentId,
        newIndex,
      });
      moveParamsWithBackend({
        sectionId,
        paramIds: orderedDraggingIds,
        newParentId,
        newIndex,
      });
      resetDragState();
    },
    [
      enabled,
      draggingIds,
      isDropValid,
      projection,
      resetDragState,
      sectionId,
      tree.parentById,
      tree.visibleChildrenByParent,
    ],
  );

  const contextValue = useMemo<ParamDndState>(
    () => ({
      activeId,
      overId,
      overPastHalfway,
      projection,
      draggingIds,
      isDropValid,
      enabled,
      indentWidth: INDENT_WIDTH,
    }),
    [
      activeId,
      overId,
      overPastHalfway,
      projection,
      draggingIds,
      isDropValid,
      enabled,
    ],
  );

  const items = useMemo(() => tree.flat.map((item) => item.id), [tree.flat]);

  return (
    <ParamDndContext.Provider value={contextValue}>
      <DragDropProvider
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDragState}
      >
        <DragOperationShapeSync enabled />
        <SortableContext
          id={sectionId}
          items={items}
          strategy={verticalListSortingStrategy}
          forceSorting={true}
        >
          {children}
        </SortableContext>
      </DragDropProvider>
    </ParamDndContext.Provider>
  );
}

function getProjection({
  flatItems,
  activeId,
  overId,
  overPastHalfway,
  offsetX,
  indentWidth,
  rootId,
}: {
  flatItems: ParamTreeView["flat"];
  activeId: string;
  overId: string;
  overPastHalfway: boolean | null;
  offsetX: number;
  indentWidth: number;
  rootId: string;
}): { parentId: string; depth: number } | null {
  const activeIndex = flatItems.findIndex((item) => item.id === activeId);
  const overIndex = flatItems.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0) {
    return null;
  }
  const activeItem = flatItems[activeIndex];
  const effectiveOverIndex = resolveEffectiveOverIndex({
    activeIndex,
    overIndex,
    pastHalfway: overPastHalfway,
    itemsLength: flatItems.length,
  });
  const newItems = arrayMove(flatItems, activeIndex, effectiveOverIndex);
  const previousItem = newItems[effectiveOverIndex - 1] ?? null;
  const nextItem = newItems[effectiveOverIndex + 1] ?? null;
  const depthDelta = Math.round(offsetX / indentWidth);
  const projectedDepth = activeItem.depth + depthDelta;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = clamp(projectedDepth, minDepth, maxDepth);

  if (depth === 0) {
    return { parentId: rootId, depth };
  }

  for (let i = overIndex - 1; i >= 0; i -= 1) {
    const item = newItems[i];
    if (item.depth === depth - 1) {
      return { parentId: item.id, depth };
    }
  }

  return { parentId: rootId, depth };
}

function getTargetVisibleIndex({
  flatItems,
  activeId,
  overId,
  overPastHalfway,
  parentId,
  depth,
  draggingSet,
}: {
  flatItems: ParamTreeView["flat"];
  activeId: string;
  overId: string;
  overPastHalfway: boolean | null;
  parentId: string;
  depth: number;
  draggingSet: Set<string>;
}): number | null {
  const activeIndex = flatItems.findIndex((item) => item.id === activeId);
  const overIndex = flatItems.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0) {
    return null;
  }
  const effectiveOverIndex = resolveEffectiveOverIndex({
    activeIndex,
    overIndex,
    pastHalfway: overPastHalfway,
    itemsLength: flatItems.length,
  });
  const projected = arrayMove(flatItems, activeIndex, effectiveOverIndex).map(
    (item) => (item.id === activeId ? { ...item, parentId, depth } : item),
  );
  const projectedIndex = projected.findIndex((item) => item.id === activeId);
  if (projectedIndex < 0) {
    return null;
  }
  const beforeActive = projected.slice(0, projectedIndex);
  return beforeActive.filter(
    (item) => item.parentId === parentId && !draggingSet.has(item.id),
  ).length;
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function getPastHalfwayFromCollisions(
  collisions: DragMoveEvent["collisions"] | null,
  overId: string | number | null,
): boolean | null {
  if (!collisions || collisions.length === 0 || !overId) {
    return null;
  }

  const match = collisions.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (!match || match.pastHalfway === undefined) {
    return null;
  }

  return Boolean(match.pastHalfway);
}

function resolveEffectiveOverIndex({
  activeIndex,
  overIndex,
  pastHalfway,
  itemsLength,
}: {
  activeIndex: number;
  overIndex: number;
  pastHalfway: boolean | null;
  itemsLength: number;
}): number {
  if (pastHalfway === null) {
    return overIndex;
  }

  return computeNewIndex(activeIndex, overIndex, pastHalfway, itemsLength);
}
