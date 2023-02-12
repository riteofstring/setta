import { closestCorners } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useKeyActivations } from "models/keyActivations";
import { customCollisionDetection } from "./collisionDetection";

export function useModifiers() {
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);

  const modifiers = isSorting ? [restrictToVerticalAxis] : null;
  const collisionDetection = isMovingFree
    ? customCollisionDetection
    : closestCorners;

  return { modifiers, collisionDetection };
}
