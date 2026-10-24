import { useIsDragActive, useItemsHaveChanged } from "./useSortingState";
import { rectFromBoundingRect } from "./rect";
import type { Collision, UniqueIdentifier } from "@dnd-kit/abstract";
import type { Droppable } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import React, { useEffect, useMemo, useRef } from "react";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getDndSectionId } from "../dndIds";
import {
  clearSortingOverState,
  setSortingOverState,
} from "../sortingOverState";
import { useDndProviderContext } from "./DndProviderContext";
import {
  getSortedRects,
  mergeMissingDroppableRects,
  normalizeDisabled,
  rectSortingStrategy,
} from "./sorting";
import type { ClientRect, Disabled, SortingStrategy } from "./types";

interface Props {
  children: React.ReactNode;
  items: UniqueIdentifier[];
  strategy?: SortingStrategy;
  id: string;
  disabled?: boolean | Disabled;
}

interface ContextDescriptor {
  activeIndex: number;
  containerId: string;
  disabled: Disabled;
  disableTransforms: boolean;
  items: UniqueIdentifier[];
  overIndex: number;
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
  id: containerId,
  items,
  strategy = rectSortingStrategy,
  disabled: disabledProp = false,
}: Props) {
  const manager = useDragDropManager();
  const { isSorting, isMovingFree } = useDndProviderContext();
  const isDragActive = useIsDragActive(manager);
  const sortingEnabled = isSorting;
  const shouldTrackSorting = sortingEnabled && isDragActive;
  const emptyRects = useMemo(() => new Map<UniqueIdentifier, ClientRect>(), []);
  const { active, collisions, droppableRects } = useSortableDragState(
    manager,
    shouldTrackSorting,
    emptyRects,
  );
  const resolvedOverId = useResolvedOverId(
    shouldTrackSorting,
    collisions,
    containerId,
    items,
    manager?.dragOperation.target?.id,
  );
  const resolvedPastHalfway = getResolvedPastHalfway(
    shouldTrackSorting,
    collisions,
    resolvedOverId,
  );
  const itemsHaveChanged = useItemsHaveChanged(items);
  const { activeIndex, overIndex, disableTransforms } = getSortableLayout({
    active,
    items,
    resolvedOverId,
    shouldTrackSorting,
    allowTemp: isMovingFree || isSorting,
    itemsHaveChanged,
  });
  const disabled = normalizeDisabled(disabledProp);
  const useFrozenRects = shouldTrackSorting && Boolean(active);
  const rectsForSorting = useFrozenDroppableRects(
    droppableRects,
    useFrozenRects,
  );
  useSortingOverStateSync({
    collisions,
    containerId,
    items,
    resolvedOverId,
    resolvedPastHalfway,
    shouldTrackSorting,
  });
  const sortedRects = useMemo(
    () =>
      shouldTrackSorting
        ? getSortedRects(items, rectsForSorting)
        : EMPTY_SORTED_RECTS,
    [items, rectsForSorting, shouldTrackSorting],
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
      strategy,
    ],
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}

function getSortableLayout({
  active,
  items,
  resolvedOverId,
  shouldTrackSorting,
  allowTemp,
  itemsHaveChanged,
}: {
  active: { id: UniqueIdentifier } | null;
  items: UniqueIdentifier[];
  resolvedOverId: UniqueIdentifier | null;
  shouldTrackSorting: boolean;
  allowTemp: boolean;
  itemsHaveChanged: boolean;
}) {
  const activeIndex = shouldTrackSorting
    ? getActiveIndex(active, items, allowTemp)
    : -1;
  const overIndex =
    shouldTrackSorting && resolvedOverId ? items.indexOf(resolvedOverId) : -1;
  return {
    activeIndex,
    overIndex,
    disableTransforms:
      shouldTrackSorting &&
      ((overIndex !== -1 && activeIndex === -1) || itemsHaveChanged),
  };
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

function useResolvedOverId(
  shouldTrackSorting: boolean,
  collisions: Array<Collision> | null,
  containerId: string,
  items: UniqueIdentifier[],
  fallbackOverId: UniqueIdentifier | undefined,
): UniqueIdentifier | null {
  const collisionOverId = shouldTrackSorting
    ? (collisions?.find((collision) => items.includes(collision.id))?.id ??
      null)
    : null;
  const hasContainerCollision =
    shouldTrackSorting &&
    Boolean(collisions?.some((collision) => collision.id === containerId));
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

    return fallbackOverId ?? null;
  }, [
    collisionOverId,
    fallbackOverId,
    hasContainerCollision,
    items,
    shouldTrackSorting,
  ]);
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

  return useFrozenRects && frozenDroppableRectsRef.current
    ? frozenDroppableRectsRef.current
    : droppableRects;
}

function useSortingOverStateSync(state: SortingOverSyncState): void {
  const host = useWorkspaceHost();
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
    if (!shouldTrackSorting || !collisions?.length || !resolvedSortingOverId) {
      clearSortingOverState(host, containerId);
      return;
    }

    setSortingOverState(
      host,
      containerId,
      resolvedSortingOverId,
      resolvedPastHalfway,
    );
  }, [
    collisions,
    containerId,
    host,
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

function getDroppableRects(
  droppables: Iterable<Droppable>,
): Map<UniqueIdentifier, ClientRect> {
  const rects = new Map<UniqueIdentifier, ClientRect>();

  for (const droppable of droppables) {
    const shape = droppable.shape;

    if (!shape) {
      continue;
    }

    rects.set(droppable.id, rectFromBoundingRect(shape.boundingRectangle));
  }

  return rects;
}
