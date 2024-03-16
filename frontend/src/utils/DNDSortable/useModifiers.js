import { restrictToVerticalAxis } from "@alissavrk/dnd-kit-modifiers";
import { useDndMode } from "utils/DNDSortable/useDndUtils";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";

export function useModifiers() {
  const { isSorting, isMovingFree } = useDndMode();

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}
