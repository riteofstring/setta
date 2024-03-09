import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useDndMode } from "hooks/useDndUtils";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";

export function useModifiers() {
  const { isSorting, isMovingFree } = useDndMode();

  const modifiers = isSorting ? null : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}
