import type { CollisionDetector } from "@dnd-kit/abstract";
import type { UseDroppableInput } from "@dnd-kit/react";
import { useDroppable as useDndKitDroppable } from "@dnd-kit/react";
import { useMemo } from "react";
import type { DndData } from "./types";
import { useCollisionDetector } from "./useCollisionDetector";

type UseDroppableArguments = Omit<
  UseDroppableInput<DndData>,
  "data" | "element" | "collisionDetector"
> & {
  data?: Record<string, unknown>;
  collisionDetector?: CollisionDetector;
};

export function useDroppable({
  data,
  collisionDetector,
  ...input
}: UseDroppableArguments) {
  const wrappedData = useMemo<DndData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return { current: data };
  }, [data]);
  const defaultCollisionDetector = useCollisionDetector();
  const { ref, isDropTarget } = useDndKitDroppable({
    ...input,
    data: wrappedData,
    collisionDetector: collisionDetector ?? defaultCollisionDetector,
  });

  const setNodeRef = (element: Element | null) => {
    ref(element);
  };

  return {
    setNodeRef,
    isOver: isDropTarget,
  };
}
