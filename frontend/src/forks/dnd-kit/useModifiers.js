import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";
import { useDndState } from "./dndState";

export function useModifiers() {
  const isSorting = useDndState((x) => x.isSorting);

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isSorting
    ? customCollisionDetectionSorting
    : customCollisionDetection;

  return { modifiers, collisionDetection };
}
