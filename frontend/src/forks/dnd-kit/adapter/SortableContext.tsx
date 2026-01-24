import type { Collision, UniqueIdentifier } from "@dnd-kit/abstract";
import type { Droppable } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import React, { useEffect, useId, useMemo, useRef } from "react";
import { getDndSectionId } from "../dndState";
import {
  clearSortingOverState,
  setSortingOverState,
} from "../sortingOverState";
import { useDndProviderContext } from "./DndProviderContext";
import {
  getSortedRects,
  itemsEqual,
  normalizeDisabled,
  rectSortingStrategy,
} from "./sorting";
import type { ClientRect, Disabled, SortingStrategy } from "./types";

interface Props {
  children: React.ReactNode;
  items: (UniqueIdentifier | { id: UniqueIdentifier })[];
  strategy?: SortingStrategy;
  id?: string;
  disabled?: boolean | Disabled;
  forceSorting?: boolean;
}

interface ContextDescriptor {
  activeIndex: number;
  containerId: string;
  disabled: Disabled;
  disableTransforms: boolean;
  items: UniqueIdentifier[];
  overIndex: number;
  useDragOverlay: boolean;
  sortedRects: Array<ClientRect | undefined>;
  strategy: SortingStrategy;
  sortingEnabled: boolean;
}

const ID_PREFIX = "Sortable";
const EMPTY_SORTED_RECTS: Array<ClientRect | undefined> = [];
export const Context = React.createContext<ContextDescriptor>({
  activeIndex: -1,
  containerId: ID_PREFIX,
  disableTransforms: false,
  items: [],
  overIndex: -1,
  useDragOverlay: false,
  sortedRects: [],
  strategy: rectSortingStrategy,
  disabled: {
    draggable: false,
    droppable: false,
  },
  sortingEnabled: false,
});

export function SortableContext({
  children,
  id,
  items: userDefinedItems,
  strategy = rectSortingStrategy,
  disabled: disabledProp = false,
  forceSorting = false,
}: Props) {
  const manager = useDragDropManager();
  const { isSorting, isMovingFree } = useDndProviderContext();
  const isDragActive = useComputed(() => {
    if (!manager) {
      return false;
    }

    const status = manager.dragOperation.status;
    return status.dragging || status.initializing;
  }, [manager]).value;
  const sortingEnabled = forceSorting || isSorting;
  const shouldTrackSorting = sortingEnabled && isDragActive;
  const generatedId = useId();
  const containerId = id ?? `${ID_PREFIX}-${generatedId}`;
  const items = useMemo<UniqueIdentifier[]>(
    () =>
      userDefinedItems.map((item) =>
        typeof item === "object" && "id" in item ? item.id : item,
      ),
    [userDefinedItems],
  );
  const emptyRects = useMemo(() => new Map<UniqueIdentifier, ClientRect>(), []);
  const active = useComputed(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return manager?.dragOperation.source ?? null;
  }, [manager, shouldTrackSorting]).value;
  const collisions = useComputed<Array<Collision> | null>(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return manager?.collisionObserver.collisions ?? null;
  }, [manager, shouldTrackSorting]).value;
  const collisionOverId = useMemo(() => {
    if (!shouldTrackSorting) {
      return null;
    }

    return getOverIdFromCollisions(
      collisions as Array<{ id: UniqueIdentifier }> | null,
      items,
    );
  }, [collisions, items, shouldTrackSorting]);
  const hasContainerCollision = useMemo(() => {
    if (!shouldTrackSorting || !collisions) {
      return false;
    }

    return collisions.some((collision) => collision.id === containerId);
  }, [collisions, containerId, shouldTrackSorting]);
  const droppableRects = useComputed(() => {
    if (!shouldTrackSorting) {
      return emptyRects;
    }

    return getDroppableRects(manager?.registry.droppables ?? []);
  }, [emptyRects, manager, shouldTrackSorting]).value;
  const frozenDroppableRectsRef = useRef<Map<
    UniqueIdentifier,
    ClientRect
  > | null>(null);

  const isDragging = shouldTrackSorting && active != null;
  const allowTemp = isMovingFree || isSorting;
  const activeIndex = shouldTrackSorting
    ? getActiveIndex(active, items, allowTemp)
    : -1;
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
  const resolvedOverId = useMemo(() => {
    if (!shouldTrackSorting) {
      lastOverIdRef.current = null;
      return null;
    }

    if (collisionOverId) {
      lastOverIdRef.current = collisionOverId;
      return collisionOverId;
    }

    if (hasContainerCollision) {
      const stickyId = lastOverIdRef.current;
      if (stickyId && items.includes(stickyId)) {
        return stickyId;
      }
    } else if (lastOverIdRef.current) {
      lastOverIdRef.current = null;
    }

    return manager?.dragOperation.target?.id ?? null;
  }, [
    collisionOverId,
    hasContainerCollision,
    items,
    manager,
    shouldTrackSorting,
  ]);
  const resolvedPastHalfway = useMemo(() => {
    if (!shouldTrackSorting || !resolvedOverId || !collisions) {
      return null;
    }

    const matching = (
      collisions as Array<{ id: UniqueIdentifier; pastHalfway?: boolean }>
    ).find((collision) => collision.id === resolvedOverId);
    if (!matching || matching.pastHalfway === undefined) {
      return null;
    }

    return Boolean(matching.pastHalfway);
  }, [collisions, resolvedOverId, shouldTrackSorting]);
  const overIndex =
    shouldTrackSorting && resolvedOverId ? items.indexOf(resolvedOverId) : -1;
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);
  const disableTransforms = shouldTrackSorting
    ? (overIndex !== -1 && activeIndex === -1) || itemsHaveChanged
    : false;
  const disabled = normalizeDisabled(disabledProp);
  const useDragOverlay = false;
  const useFrozenRects = shouldTrackSorting && Boolean(active);

  useEffect(() => {
    previousItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!useFrozenRects) {
      frozenDroppableRectsRef.current = null;
      return;
    }

    if (!frozenDroppableRectsRef.current) {
      frozenDroppableRectsRef.current = droppableRects;
      return;
    }

    if (droppableRects.size > frozenDroppableRectsRef.current.size) {
      const nextRects = new Map(frozenDroppableRectsRef.current);
      for (const [idKey, rect] of droppableRects.entries()) {
        if (!nextRects.has(idKey)) {
          nextRects.set(idKey, rect);
        }
      }
      frozenDroppableRectsRef.current = nextRects;
    }
  }, [droppableRects, useFrozenRects]);

  useEffect(() => {
    if (!shouldTrackSorting) {
      clearSortingOverState(containerId);
      return;
    }

    if (!collisions || collisions.length === 0) {
      clearSortingOverState(containerId);
      return;
    }

    const resolvedId =
      resolvedOverId && items.includes(String(resolvedOverId))
        ? String(resolvedOverId)
        : null;
    if (!resolvedId) {
      clearSortingOverState(containerId);
      return;
    }

    setSortingOverState(containerId, resolvedId, resolvedPastHalfway);
  }, [
    collisions,
    containerId,
    items,
    resolvedOverId,
    resolvedPastHalfway,
    shouldTrackSorting,
  ]);

  const rectsForSorting =
    useFrozenRects && frozenDroppableRectsRef.current
      ? frozenDroppableRectsRef.current
      : droppableRects;
  const sortedRects = useMemo(() => {
    if (!shouldTrackSorting) {
      return EMPTY_SORTED_RECTS;
    }

    return getSortedRects(items, rectsForSorting);
  }, [items, rectsForSorting, shouldTrackSorting]);

  const contextValue = useMemo(
    (): ContextDescriptor => ({
      activeIndex,
      containerId,
      disabled,
      disableTransforms,
      items,
      overIndex,
      sortingEnabled,
      useDragOverlay,
      sortedRects,
      strategy,
    }),
    [
      activeIndex,
      containerId,
      disabled,
      disableTransforms,
      items,
      overIndex,
      sortingEnabled,
      sortedRects,
      useDragOverlay,
      strategy,
    ],
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}

function getActiveIndex(
  active: { id: UniqueIdentifier } | null,
  items: UniqueIdentifier[],
  allowTemp: boolean,
): number {
  if (!active) {
    return -1;
  }

  if (allowTemp) {
    const tempIndex = items.indexOf(getDndSectionId(String(active.id)));
    if (tempIndex >= 0) {
      return tempIndex;
    }
  }

  return items.indexOf(active.id);
}

function getOverIdFromCollisions(
  collisions: Array<{ id: UniqueIdentifier }> | null,
  items: UniqueIdentifier[],
): UniqueIdentifier | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  for (const collision of collisions) {
    if (items.includes(collision.id)) {
      return collision.id;
    }
  }

  return null;
}

function getDroppableRects(
  droppables: Iterable<Droppable>,
): Map<UniqueIdentifier, ClientRect> {
  const rects = new Map<UniqueIdentifier, ClientRect>();

  for (const droppable of droppables) {
    const shape = droppable.shape;

    if (!shape) {
      continue;
    }

    const rect = shape.boundingRectangle;
    rects.set(droppable.id, {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  }

  return rects;
}
