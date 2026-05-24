import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import _ from "lodash";
import { getSectionIsHorizontalOrientation } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useDndState } from "./dndState";

export function useModifiers() {
  const { isSorting, activeId } = useDndState((x) => {
    return { isSorting: x.isSorting, activeId: x.activeId };
  }, _.isEqual);

  const modifiers = getModifiers(isSorting, activeId);

  return { modifiers };
}

function getModifiers(isSorting: boolean, activeId: string | null) {
  if (isSorting && activeId) {
    const parentId = useProjectState.getState().parentSectionMap[activeId];
    if (parentId) {
      return getSectionIsHorizontalOrientation(parentId)
        ? [RestrictToHorizontalAxis]
        : [RestrictToVerticalAxis];
    }
  }
  return null;
}
