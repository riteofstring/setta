import type { UniqueIdentifier } from "@dnd-kit/abstract";
import type { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useEffect, useRef } from "react";
import { itemsEqual } from "./sorting";

export function useIsDragActive(
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

export function useItemsHaveChanged(items: UniqueIdentifier[]): boolean {
  const previousItemsRef = useRef(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);

  useEffect(() => {
    previousItemsRef.current = items;
  }, [items]);

  return itemsHaveChanged;
}
