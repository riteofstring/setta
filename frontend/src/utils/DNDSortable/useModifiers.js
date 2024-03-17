import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";
import { useDndMode } from "./dndState";

export function useModifiers() {
  const { isSorting, isMovingFree } = useDndMode();

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}
