import { useComputed } from "@dnd-kit/react/hooks";
import type { Collision, UniqueIdentifier } from "@dnd-kit/abstract";
import type { Droppable } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import React, { useEffect, useMemo, useRef, useId } from "react";
import { getDndSectionId, useDndMode } from "../dndState";
import type { ClientRect, Disabled, SortingStrategy } from "./types";
import {
  getSortedRects,
  itemsEqual,
  normalizeDisabled,
  rectSortingStrategy,
} from "./sorting";

interface Props {
  children: React.ReactNode;
  items: (UniqueIdentifier | { id: UniqueIdentifier })[];
  strategy?: SortingStrategy;
  id?: string;
  disabled?: boolean | Disabled;
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
}

const ID_PREFIX = "Sortable";
const DEBUG_DND_SORTING = true;
const DEBUG_DND_SORTING_VERBOSE = true;

type SortableDebugState = {
  activeId: string | null;
  overId: string | null;
  collisionOverId: string | null;
  rawOverId: string | null;
  activeIndex: number;
  overIndex: number;
  itemsKey: string;
  collisionsSummary: string | null;
  disableTransforms: boolean;
  hasContainerCollision: boolean;
  containerId: string;
};

function logDndSorting(label: string, data: Record<string, unknown>) {
  if (!DEBUG_DND_SORTING) {
    return;
  }

  console.log("[dnd-sorting]", label, data);
}

function formatCollisionsSummary(
  collisions: Array<Collision> | null,
): string | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  return collisions
    .map((collision) => {
      const id = String(collision.id);
      const value =
        typeof collision.value === "number"
          ? collision.value.toFixed(2)
          : String(collision.value);
      return `${id}:${value}`;
    })
    .join(" | ");
}

function formatCollisions(
  collisions: Array<Collision> | null,
): Array<{ id: UniqueIdentifier; value: number | string }> | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  return collisions.map((collision) => ({
    id: collision.id,
    value: collision.value,
  }));
}

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
});

export function SortableContext({
  children,
  id,
  items: userDefinedItems,
  strategy = rectSortingStrategy,
  disabled: disabledProp = false,
}: Props) {
  const manager = useDragDropManager();
  const rawOverId = useComputed<UniqueIdentifier | null>(
    () => manager?.dragOperation.target?.id ?? null,
    [manager],
  ).value;
  const generatedId = useId();
  const containerId = id ?? `${ID_PREFIX}-${generatedId}`;
  const items = useMemo<UniqueIdentifier[]>(
    () =>
      userDefinedItems.map((item) =>
        typeof item === "object" && "id" in item ? item.id : item,
      ),
    [userDefinedItems],
  );
  const active = useComputed(
    () => manager?.dragOperation.source ?? null,
    [manager],
  ).value;
  const dndMode = useDndMode();
  const collisions = useComputed<Array<Collision> | null>(
    () => manager?.collisionObserver.collisions ?? null,
    [manager],
  ).value;
  const collisionOverId = useComputed(
    () =>
      getOverIdFromCollisions(
        collisions as Array<{ id: UniqueIdentifier }> | null,
        items,
      ),
    [collisions, items],
  ).value;
  const hasContainerCollision = useComputed(
    () =>
      Boolean(
        (collisions as Array<{ id: UniqueIdentifier }> | null)?.some(
          (collision) => collision.id === containerId,
        ),
      ),
    [collisions, containerId],
  ).value;
  const droppableRects = useComputed(
    () => getDroppableRects(manager?.registry.droppables ?? []),
    [manager],
  ).value;

  const isDragging = active != null;
  const activeIndex = getActiveIndex(active, items);
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
  const resolvedOverId = useMemo(() => {
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
  }, [collisionOverId, hasContainerCollision, items, manager]);
  const overIndex = resolvedOverId ? items.indexOf(resolvedOverId) : -1;
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);
  const disableTransforms =
    (overIndex !== -1 && activeIndex === -1) || itemsHaveChanged;
  const disabled = normalizeDisabled(disabledProp);
  const useDragOverlay = dndMode.isMovingFree && Boolean(active);
  const collisionsSummary = useMemo(
    () => formatCollisionsSummary(collisions),
    [collisions],
  );
  const debugRef = useRef<SortableDebugState | null>(null);

  useEffect(() => {
    if (!DEBUG_DND_SORTING) {
      return;
    }

    const activeId = active?.id ? String(active.id) : null;
    const resolvedOverIdStr = resolvedOverId ? String(resolvedOverId) : null;
    const collisionOverIdStr = collisionOverId
      ? String(collisionOverId)
      : null;
    const rawOverIdStr = rawOverId ? String(rawOverId) : null;
    const itemsKey = items.map((item) => String(item)).join("|");
    const nextState: SortableDebugState = {
      activeId,
      overId: resolvedOverIdStr,
      collisionOverId: collisionOverIdStr,
      rawOverId: rawOverIdStr,
      activeIndex,
      overIndex,
      itemsKey,
      collisionsSummary,
      disableTransforms,
      hasContainerCollision,
      containerId,
    };

    const prevState = debugRef.current;
    const hasActiveOrOver = Boolean(activeId || resolvedOverIdStr);
    if (!prevState && !hasActiveOrOver) {
      return;
    }

    let shouldLog = false;
    if (!prevState) {
      shouldLog = true;
    } else if (
      prevState.activeId !== nextState.activeId ||
      prevState.overId !== nextState.overId ||
      prevState.collisionOverId !== nextState.collisionOverId ||
      prevState.rawOverId !== nextState.rawOverId ||
      prevState.activeIndex !== nextState.activeIndex ||
      prevState.overIndex !== nextState.overIndex ||
      prevState.itemsKey !== nextState.itemsKey ||
      prevState.collisionsSummary !== nextState.collisionsSummary ||
      prevState.disableTransforms !== nextState.disableTransforms ||
      prevState.hasContainerCollision !== nextState.hasContainerCollision ||
      prevState.containerId !== nextState.containerId
    ) {
      shouldLog = true;
    }

    if (shouldLog) {
      logDndSorting("sortable-context", {
        containerId,
        activeId,
        activeIndex,
        overId: resolvedOverIdStr,
        overIndex,
        collisionOverId: collisionOverIdStr,
        rawOverId: rawOverIdStr,
        disableTransforms,
        hasContainerCollision,
        items,
        collisionsSummary,
      });

      if (DEBUG_DND_SORTING_VERBOSE) {
        const collisionsList = formatCollisions(collisions);
        if (collisionsList) {
          logDndSorting("sortable-context-collisions", {
            containerId,
            collisions: collisionsList,
          });
        }
      }
    }

    debugRef.current = nextState;
  }, [
    active,
    activeIndex,
    collisions,
    collisionsSummary,
    collisionOverId,
    containerId,
    disableTransforms,
    hasContainerCollision,
    items,
    overIndex,
    rawOverId,
    resolvedOverId,
  ]);

  useEffect(() => {
    previousItemsRef.current = items;
  }, [items]);

  const contextValue = useMemo(
    (): ContextDescriptor => ({
      activeIndex,
      containerId,
      disabled,
      disableTransforms,
      items,
      overIndex,
      useDragOverlay,
      sortedRects: getSortedRects(items, droppableRects),
      strategy,
    }),
    [
      activeIndex,
      containerId,
      disabled,
      disableTransforms,
      items,
      overIndex,
      droppableRects,
      useDragOverlay,
      dndMode.isMovingFree,
      strategy,
    ],
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}

function getActiveIndex(
  active: { id: UniqueIdentifier } | null,
  items: UniqueIdentifier[],
): number {
  if (!active) {
    return -1;
  }

  const tempIndex = items.indexOf(getDndSectionId(String(active.id)));
  if (tempIndex >= 0) {
    return tempIndex;
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
