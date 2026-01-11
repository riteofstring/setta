import { useComputed } from "@dnd-kit/react/hooks";
import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type { Droppable } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import React, { useEffect, useMemo, useRef, useId } from "react";
import { getDndSectionId } from "../dndState";
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
  const over = useComputed(
    () => manager?.dragOperation.target ?? null,
    [manager],
  ).value;
  const droppableRects = useComputed(
    () => getDroppableRects(manager?.registry.droppables ?? []),
    [manager],
  ).value;

  const isDragging = active != null;
  const activeIndex = getActiveIndex(active, items);
  const overIndex = over?.id ? items.indexOf(over.id) : -1;
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);
  const disableTransforms =
    (overIndex !== -1 && activeIndex === -1) || itemsHaveChanged;
  const disabled = normalizeDisabled(disabledProp);
  const useDragOverlay = Boolean(active);

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
