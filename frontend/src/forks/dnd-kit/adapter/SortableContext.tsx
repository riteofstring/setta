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

interface SortingOverSyncState {
  collisions: Array<Collision> | null;
  containerId: string;
  items: UniqueIdentifier[];
  resolvedOverId: UniqueIdentifier | null;
  resolvedPastHalfway: boolean | null;
  shouldTrackSorting: boolean;
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
  const isDragActive = useDragActive(manager);
  const sortingEnabled = isSortingEnabled(forceSorting, isSorting);
  const shouldTrackSorting = shouldTrackActiveSorting(
    sortingEnabled,
    isDragActive,
  );
  const generatedId = useId();
  const containerId = getContainerId(id, generatedId);
  const items = useMemo<UniqueIdentifier[]>(
    () => userDefinedItems.map(getSortableItemId),
    [userDefinedItems],
  );
  const emptyRects = useMemo(() => new Map<UniqueIdentifier, ClientRect>(), []);
  const { active, collisions, droppableRects } = useSortableDragState(
    manager,
    shouldTrackSorting,
    emptyRects,
  );
  const allowTemp = shouldAllowTemporaryActiveId(isMovingFree, isSorting);
  const activeIndex = getSortableActiveIndex(
    shouldTrackSorting,
    active,
    items,
    allowTemp,
  );
  const resolvedOverId = useResolvedOverId(
    shouldTrackSorting,
    collisions,
    containerId,
    items,
    getFallbackOverId(manager),
  );
  const resolvedPastHalfway = getResolvedPastHalfway(
    shouldTrackSorting,
    collisions,
    resolvedOverId,
  );
  const overIndex = getSortableOverIndex(
    shouldTrackSorting,
    resolvedOverId,
    items,
  );
  const itemsHaveChanged = useItemsHaveChanged(items);
  const disableTransforms = getDisableTransforms(
    shouldTrackSorting,
    overIndex,
    activeIndex,
    itemsHaveChanged,
  );
  const disabled = normalizeDisabled(disabledProp);
  const useDragOverlay = false;
  const useFrozenRects = shouldFreezeDroppableRects(shouldTrackSorting, active);
  const frozenDroppableRectsRef = useFrozenDroppableRects(
    droppableRects,
    useFrozenRects,
  );
  const rectsForSorting = getRectsForSorting(
    useFrozenRects,
    frozenDroppableRectsRef.current,
    droppableRects,
  );
  useSortingOverStateSync({
    collisions,
    containerId,
    items,
    resolvedOverId,
    resolvedPastHalfway,
    shouldTrackSorting,
  });
  const sortedRects = useSortedRects(
    shouldTrackSorting,
    items,
    rectsForSorting,
  );

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

function getSortableItemId(
  item: UniqueIdentifier | { id: UniqueIdentifier },
): UniqueIdentifier {
  return typeof item === "object" && "id" in item ? item.id : item;
}

function isSortingEnabled(forceSorting: boolean, isSorting: boolean): boolean {
  return forceSorting || isSorting;
}

function shouldTrackActiveSorting(
  sortingEnabled: boolean,
  isDragActive: boolean,
): boolean {
  return sortingEnabled && isDragActive;
}

function getContainerId(id: string | undefined, generatedId: string): string {
  return id ?? `${ID_PREFIX}-${generatedId}`;
}

function shouldAllowTemporaryActiveId(
  isMovingFree: boolean,
  isSorting: boolean,
): boolean {
  return isMovingFree || isSorting;
}

function getFallbackOverId(
  manager: ReturnType<typeof useDragDropManager>,
): UniqueIdentifier | null {
  return manager?.dragOperation.target?.id ?? null;
}

function useDragActive(
  manager: ReturnType<typeof useDragDropManager>,
): boolean {
  return useComputed(() => {
    if (!manager) {
      return false;
    }

    const status = manager.dragOperation.status;
    return status.dragging || status.initializing;
  }, [manager]).value;
}

function useSortableDragState(
  manager: ReturnType<typeof useDragDropManager>,
  shouldTrackSorting: boolean,
  emptyRects: Map<UniqueIdentifier, ClientRect>,
) {
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
  const droppableRects = useComputed(() => {
    if (!shouldTrackSorting) {
      return emptyRects;
    }

    return getDroppableRects(manager?.registry.droppables ?? []);
  }, [emptyRects, manager, shouldTrackSorting]).value;

  return { active, collisions, droppableRects };
}

function getSortableActiveIndex(
  shouldTrackSorting: boolean,
  active: { id: UniqueIdentifier } | null,
  items: UniqueIdentifier[],
  allowTemp: boolean,
): number {
  if (!shouldTrackSorting) {
    return -1;
  }

  return getActiveIndex(active, items, allowTemp);
}

function getSortableOverIndex(
  shouldTrackSorting: boolean,
  resolvedOverId: UniqueIdentifier | null,
  items: UniqueIdentifier[],
): number {
  if (!shouldTrackSorting || !resolvedOverId) {
    return -1;
  }

  return items.indexOf(resolvedOverId);
}

function useItemsHaveChanged(items: UniqueIdentifier[]): boolean {
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);

  useEffect(() => {
    previousItemsRef.current = items;
  }, [items]);

  return itemsHaveChanged;
}

function getDisableTransforms(
  shouldTrackSorting: boolean,
  overIndex: number,
  activeIndex: number,
  itemsHaveChanged: boolean,
): boolean {
  if (!shouldTrackSorting) {
    return false;
  }

  return (overIndex !== -1 && activeIndex === -1) || itemsHaveChanged;
}

function shouldFreezeDroppableRects(
  shouldTrackSorting: boolean,
  active: { id: UniqueIdentifier } | null,
): boolean {
  return shouldTrackSorting && Boolean(active);
}

function useResolvedOverId(
  shouldTrackSorting: boolean,
  collisions: Array<Collision> | null,
  containerId: string,
  items: UniqueIdentifier[],
  fallbackOverId: UniqueIdentifier | null,
): UniqueIdentifier | null {
  const collisionOverId = getSortingCollisionOverId(
    shouldTrackSorting,
    collisions,
    items,
  );
  const hasContainerCollision = hasCollisionId(
    shouldTrackSorting,
    collisions,
    containerId,
  );
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);

  return useMemo(() => {
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
    } else {
      lastOverIdRef.current = null;
    }

    return fallbackOverId;
  }, [
    collisionOverId,
    fallbackOverId,
    hasContainerCollision,
    items,
    shouldTrackSorting,
  ]);
}

function getSortingCollisionOverId(
  shouldTrackSorting: boolean,
  collisions: Array<Collision> | null,
  items: UniqueIdentifier[],
): UniqueIdentifier | null {
  if (!shouldTrackSorting) {
    return null;
  }

  return getOverIdFromCollisions(
    collisions as Array<{ id: UniqueIdentifier }> | null,
    items,
  );
}

function hasCollisionId(
  shouldTrackSorting: boolean,
  collisions: Array<Collision> | null,
  collisionId: UniqueIdentifier,
): boolean {
  if (!shouldTrackSorting || !collisions) {
    return false;
  }

  return collisions.some((collision) => collision.id === collisionId);
}

function getResolvedPastHalfway(
  shouldTrackSorting: boolean,
  collisions: Array<Collision> | null,
  resolvedOverId: UniqueIdentifier | null,
): boolean | null {
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
}

function useFrozenDroppableRects(
  droppableRects: Map<UniqueIdentifier, ClientRect>,
  useFrozenRects: boolean,
) {
  const frozenDroppableRectsRef = useRef<Map<
    UniqueIdentifier,
    ClientRect
  > | null>(null);

  useEffect(() => {
    if (!useFrozenRects) {
      frozenDroppableRectsRef.current = null;
      return;
    }

    frozenDroppableRectsRef.current = mergeMissingDroppableRects(
      frozenDroppableRectsRef.current,
      droppableRects,
    );
  }, [droppableRects, useFrozenRects]);

  return frozenDroppableRectsRef;
}

function mergeMissingDroppableRects(
  existing: Map<UniqueIdentifier, ClientRect> | null,
  incoming: Map<UniqueIdentifier, ClientRect>,
): Map<UniqueIdentifier, ClientRect> {
  if (!existing) {
    return incoming;
  }

  if (incoming.size <= existing.size) {
    return existing;
  }

  const nextRects = new Map(existing);
  for (const [idKey, rect] of incoming.entries()) {
    if (!nextRects.has(idKey)) {
      nextRects.set(idKey, rect);
    }
  }

  return nextRects;
}

function getRectsForSorting(
  useFrozenRects: boolean,
  frozenRects: Map<UniqueIdentifier, ClientRect> | null,
  droppableRects: Map<UniqueIdentifier, ClientRect>,
): Map<UniqueIdentifier, ClientRect> {
  if (useFrozenRects && frozenRects) {
    return frozenRects;
  }

  return droppableRects;
}

function useSortingOverStateSync(state: SortingOverSyncState): void {
  const {
    collisions,
    containerId,
    items,
    resolvedOverId,
    resolvedPastHalfway,
    shouldTrackSorting,
  } = state;
  const resolvedSortingOverId = getSortingOverStateId(items, resolvedOverId);

  useEffect(() => {
    if (
      !shouldTrackSorting ||
      !hasCollisions(collisions) ||
      !resolvedSortingOverId
    ) {
      clearSortingOverState(containerId);
      return;
    }

    setSortingOverState(
      containerId,
      resolvedSortingOverId,
      resolvedPastHalfway,
    );
  }, [
    collisions,
    containerId,
    resolvedPastHalfway,
    resolvedSortingOverId,
    shouldTrackSorting,
  ]);
}

function getSortingOverStateId(
  items: UniqueIdentifier[],
  resolvedOverId: UniqueIdentifier | null,
): string | null {
  if (!resolvedOverId) {
    return null;
  }

  const normalizedOverId = String(resolvedOverId);
  if (!items.includes(normalizedOverId)) {
    return null;
  }

  return normalizedOverId;
}

function hasCollisions(collisions: Array<Collision> | null): boolean {
  return Boolean(collisions && collisions.length > 0);
}

function useSortedRects(
  shouldTrackSorting: boolean,
  items: UniqueIdentifier[],
  rectsForSorting: Map<UniqueIdentifier, ClientRect>,
): Array<ClientRect | undefined> {
  return useMemo(() => {
    if (!shouldTrackSorting) {
      return EMPTY_SORTED_RECTS;
    }

    return getSortedRects(items, rectsForSorting);
  }, [items, rectsForSorting, shouldTrackSorting]);
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
