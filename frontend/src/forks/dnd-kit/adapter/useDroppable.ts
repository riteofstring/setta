import { useMemo, useRef } from "react";
import { useDroppable as useDndKitDroppable } from "@dnd-kit/react";
import type { UseDroppableInput } from "@dnd-kit/react";
import type { CollisionDetector } from "@dnd-kit/abstract";
import type { DndData } from "./types";
import { useCollisionDetector } from "./useCollisionDetector";

export type UseDroppableArguments = Omit<
  UseDroppableInput<DndData>,
  "data" | "element" | "collisionDetector"
> & {
  data?: Record<string, unknown>;
  collisionDetector?: CollisionDetector;
};

export function useDroppable({ data, collisionDetector, ...input }: UseDroppableArguments) {
  const wrappedData = useMemo<DndData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return { current: data };
  }, [data]);
  const defaultCollisionDetector = useCollisionDetector();
  const elementRef = useRef<Element | null>(null);
  const { ref, isDropTarget, droppable } = useDndKitDroppable({
    ...input,
    data: wrappedData,
    collisionDetector: collisionDetector ?? defaultCollisionDetector,
  });

  const setNodeRef = (element: Element | null) => {
    elementRef.current = element;
    ref(element);
  };

  return {
    setNodeRef,
    node: elementRef,
    isOver: isDropTarget,
    droppable,
  };
}
