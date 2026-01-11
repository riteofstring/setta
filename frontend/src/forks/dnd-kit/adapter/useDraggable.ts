import { useMemo, useRef } from "react";
import { useDraggable as useDndKitDraggable } from "@dnd-kit/react";
import type { UseDraggableInput } from "@dnd-kit/react";
import type { DndData } from "./types";

export type UseDraggableArguments = Omit<
  UseDraggableInput<DndData>,
  "data" | "element" | "handle"
> & {
  data?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
};

export function useDraggable({
  data,
  attributes,
  ...input
}: UseDraggableArguments) {
  const wrappedData = useMemo<DndData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return { current: data };
  }, [data]);

  const elementRef = useRef<Element | null>(null);
  const {
    ref,
    handleRef,
    isDragging,
    draggable,
  } = useDndKitDraggable({
    ...input,
    data: wrappedData,
  });

  const setNodeRef = (element: Element | null) => {
    elementRef.current = element;
    ref(element);
  };

  return {
    attributes: attributes ?? {},
    listeners: {},
    setNodeRef,
    setActivatorNodeRef: handleRef,
    isDragging,
    node: elementRef,
    draggable,
  };
}
