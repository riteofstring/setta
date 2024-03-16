import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";
import { useDndState } from "./dndState";

export function useModifiers() {
  const { isSorting, isMovingFree } = useDndState((x) => ({
    isSorting: x.isSorting,
    isMovingFree: x.isMovingFree,
  }));

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}
