import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useKeyActivations } from "models/keyActivations";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";

export function useModifiers() {
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}
