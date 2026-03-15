import { type ZustandProjectState } from "state/definitions";
import { type Position } from "utils/generatedTypes";
import { moveSectionsToPane } from "./moveSectionPaneState";
import {
  moveSectionsIntoParent,
  removeSectionsFromParents,
} from "./moveSectionParentState";
import { resolveParentIds } from "./moveSectionQueries";

export type MoveSectionsInput = {
  sectionIds: string[];
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};

type MoveSectionsStateInput = MoveSectionsInput & {
  state: ZustandProjectState;
};

export function moveSectionsInState({
  sectionIds,
  newParentId,
  newIndex,
  positionsById,
  state,
}: MoveSectionsStateInput): void {
  const parentsById = resolveParentIds(state, sectionIds);
  if (newParentId === null) {
    removeSectionsFromParents({
      sectionIds,
      parentsById,
      state,
      removeTopLevelNodes: false,
    });
    moveSectionsToPane({
      sectionIds,
      positionsById,
      state,
    });
    return;
  }
  if (newIndex === null) {
    throw new Error("Expected newIndex when moving sections into parent.");
  }
  removeSectionsFromParents({
    sectionIds,
    parentsById,
    state,
    removeTopLevelNodes: true,
  });
  moveSectionsIntoParent({
    sectionIds,
    newParentId,
    newIndex,
    state,
  });
}
