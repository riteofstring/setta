import type { CollisionDetector } from "@dnd-kit/abstract";
import { createContext, useContext } from "react";

type DndProviderContextValue = {
  isSorting: boolean;
  isMovingFree: boolean;
  collisionDetector: CollisionDetector;
  sortingCollisionDetector: CollisionDetector;
};

const DndProviderContext = createContext<DndProviderContextValue | null>(null);

export function useDndProviderContext(): DndProviderContextValue {
  const context = useContext(DndProviderContext);
  if (!context) {
    throw new Error(
      "useDndProviderContext must be used within DragDropProvider",
    );
  }
  return context;
}

export { DndProviderContext };
