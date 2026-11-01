import type { CollisionDetector } from "@dnd-kit/abstract";
import { useContext } from "react";
import { useDndProviderContext } from "./DndProviderContext.js";
import { Context as SortableContext } from "./SortableContext.js";

export function useCollisionDetector(): CollisionDetector {
  const { isSorting, collisionDetector, sortingCollisionDetector } =
    useDndProviderContext();
  const { sortingEnabled } = useContext(SortableContext);
  return isSorting || sortingEnabled
    ? sortingCollisionDetector
    : collisionDetector;
}
