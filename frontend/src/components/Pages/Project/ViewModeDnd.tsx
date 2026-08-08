import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import { PointerSensor } from "@dnd-kit/dom";
import { arrayMove } from "@dnd-kit/helpers";
import {
  DragDropProvider,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
  type SettaCollision,
} from "forks/dnd-kit/adapter";
import { transformToString } from "forks/dnd-kit/adapter/zoom";
import { DragOperationShapeSync } from "forks/dnd-kit/DragOperationShapeSync";
import { useMemo, type CSSProperties } from "react";

type SortableListProviderProps = {
  id: string;
  items: Array<string>;
  direction: "horizontal" | "vertical";
  onReorder: (orderedIds: Array<string>) => void;
  enabled?: boolean;
  children: React.ReactNode;
};

export function SortableListProvider({
  enabled = true,
  id,
  items,
  direction,
  onReorder,
  children,
}: SortableListProviderProps) {
  if (typeof window === "undefined") {
    return <>{children}</>;
  }

  return (
    <SortableListProviderClient
      enabled={enabled}
      id={id}
      items={items}
      direction={direction}
      onReorder={onReorder}
    >
      {children}
    </SortableListProviderClient>
  );
}

type SortableListProviderClientProps = SortableListProviderProps;

function SortableListProviderClient({
  enabled,
  id,
  items,
  direction,
  onReorder,
  children,
}: SortableListProviderClientProps) {
  const sensors = useMemo(
    () =>
      enabled
        ? [
            PointerSensor.configure({
              preventActivation: () => false,
            }),
          ]
        : [],
    [enabled],
  );
  const dndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );
  const strategy =
    direction === "horizontal"
      ? horizontalListSortingStrategy
      : verticalListSortingStrategy;
  const modifiers = useMemo(
    () => [
      direction === "horizontal"
        ? RestrictToHorizontalAxis
        : RestrictToVerticalAxis,
    ],
    [direction],
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!enabled) {
      return;
    }
    const nextOrderedIds = resolveReorderedIds({
      event,
      orderedIds: items,
      direction,
    });
    if (!nextOrderedIds) {
      return;
    }
    onReorder(nextOrderedIds);
  }

  return (
    <DragDropProvider
      sensors={sensors}
      modifiers={modifiers}
      dndContext={dndContext}
      onDragEnd={handleDragEnd}
    >
      <DragOperationShapeSync enabled />
      <SortableContext id={id} items={items} strategy={strategy} forceSorting>
        {children}
      </SortableContext>
    </DragDropProvider>
  );
}

export function useSortableListItem(
  id: string,
  disabled: boolean,
  direction: "horizontal" | "vertical" = "vertical",
) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: "sortable-list-item",
      sortableOrientation: direction,
    },
    disabled,
    transition: {
      duration: 30,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    },
  });
  const style: CSSProperties = {
    transform: transformToString(transform),
    transition,
    zIndex: isDragging ? 3 : undefined,
  };
  return {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    style,
    isDragging,
  };
}

function resolveOverId(
  event: DragEndEvent,
  orderedIds: Array<string>,
  activeId: string,
): string | null {
  const itemIds = new Set(orderedIds);
  const collisions = event.collisions as SettaCollision[] | null;
  if (collisions) {
    for (const collision of collisions) {
      const collisionId = String(collision.id);
      if (itemIds.has(collisionId) && collisionId !== activeId) {
        return collisionId;
      }
    }
  }
  const overId = event.over ? String(event.over.id) : null;
  if (overId && itemIds.has(overId) && overId !== activeId) {
    return overId;
  }
  return null;
}

const DRAG_RELEASE_THRESHOLD_PX = 4;

function hasDragged(
  event: DragEndEvent,
  direction: "horizontal" | "vertical",
): boolean {
  const primaryDelta =
    direction === "horizontal"
      ? Math.abs(event.delta.x)
      : Math.abs(event.delta.y);
  const secondaryDelta =
    direction === "horizontal"
      ? Math.abs(event.delta.y)
      : Math.abs(event.delta.x);
  return (
    primaryDelta > DRAG_RELEASE_THRESHOLD_PX ||
    secondaryDelta > DRAG_RELEASE_THRESHOLD_PX
  );
}

function resolveReorderedIds({
  event,
  orderedIds,
  direction,
}: {
  event: DragEndEvent;
  orderedIds: Array<string>;
  direction: "horizontal" | "vertical";
}): Array<string> | null {
  if (!hasDragged(event, direction)) {
    return null;
  }
  const activeId = String(event.active.id);
  const activeIndex = orderedIds.indexOf(activeId);
  if (activeIndex === -1) {
    return null;
  }
  const overId = resolveOverId(event, orderedIds, activeId);
  if (!overId) {
    return null;
  }
  const overIndex = orderedIds.indexOf(overId);
  if (overIndex === -1) {
    return null;
  }
  if (isOppositeDropDirection(event, direction, activeIndex, overIndex)) {
    return null;
  }
  const nextIndex = overIndex;
  if (nextIndex === activeIndex) {
    return null;
  }
  const nextOrderedIds = arrayMove(orderedIds, activeIndex, nextIndex);
  if (isSameOrder(nextOrderedIds, orderedIds)) {
    return null;
  }
  return nextOrderedIds;
}

function isOppositeDropDirection(
  event: DragEndEvent,
  direction: "horizontal" | "vertical",
  activeIndex: number,
  overIndex: number,
): boolean {
  const axisDelta = direction === "horizontal" ? event.delta.x : event.delta.y;
  if (axisDelta > 0 && overIndex < activeIndex) {
    return true;
  }
  if (axisDelta < 0 && overIndex > activeIndex) {
    return true;
  }
  return false;
}

function isSameOrder(left: Array<string>, right: Array<string>): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let idx = 0; idx < left.length; idx += 1) {
    if (left[idx] !== right[idx]) {
      return false;
    }
  }
  return true;
}
