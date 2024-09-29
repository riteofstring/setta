import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import _ from "lodash";
import { getSectionInfo, getSectionParentId } from "state/getters/sectionInfo";
import { customCollisionDetection } from "./collisionDetection";
import { customCollisionDetectionSorting } from "./collisionDetectionSorting";
import { useDndState } from "./dndState";

export function useModifiers() {
  const { isSorting, activeId } = useDndState(
    (x) => _.pick(x, ["isSorting", "activeId"]),
    _.isEqual,
  );

  const modifiers = getModifiers(isSorting, activeId);
  const collisionDetection = isSorting
    ? customCollisionDetectionSorting
    : customCollisionDetectionSorting;

  return { modifiers, collisionDetection };
}

function getModifiers(isSorting, activeId) {
  if (isSorting && activeId) {
    const parentId = getSectionParentId(activeId);
    if (parentId) {
      return getSectionInfo(parentId).isHorizontalOrientation
        ? [restrictToHorizontalAxis]
        : [restrictToVerticalAxis];
    }
  }
  return null;
}
