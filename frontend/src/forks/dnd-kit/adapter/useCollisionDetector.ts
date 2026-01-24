import type { CollisionDetector } from "@dnd-kit/abstract";
import { useDndState } from "../dndState";
import {
  customCollisionDetection,
  customCollisionDetectionSorting,
} from "./collision";

export function useCollisionDetector(): CollisionDetector {
  const isSorting = useDndState((x) => x.isSorting);
  return isSorting ? customCollisionDetectionSorting : customCollisionDetection;
}
