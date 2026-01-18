import type { CollisionDetector } from "@dnd-kit/abstract";
import { useContext } from "react";
import { useDndState } from "../dndState";
import {
  customCollisionDetection,
  customCollisionDetectionSorting,
} from "./collision";
import { Context as SortableContext } from "./SortableContext";

export function useCollisionDetector(): CollisionDetector {
  const isSorting = useDndState((x) => x.isSorting);
  const { sortingEnabled } = useContext(SortableContext);
  return isSorting || sortingEnabled
    ? customCollisionDetectionSorting
    : customCollisionDetection;
}
