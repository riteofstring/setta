import { useMemo, useRef } from "react";
import { useDroppable as useDndKitDroppable } from "@dnd-kit/react";
import type { UseDroppableInput } from "@dnd-kit/react";
import type { DndData } from "./types";

export type UseDroppableArguments = Omit<
  UseDroppableInput<DndData>,
  "data" | "element"
> & {
  data?: Record<string, unknown>;
};

export function useDroppable({ data, ...input }: UseDroppableArguments) {
  const wrappedData = useMemo<DndData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return { current: data };
  }, [data]);
  const elementRef = useRef<Element | null>(null);
  const { ref, isDropTarget, droppable } = useDndKitDroppable({
    ...input,
    data: wrappedData,
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
