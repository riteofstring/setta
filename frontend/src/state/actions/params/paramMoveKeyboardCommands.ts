import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionEffectiveImplSelectors";
import { useProjectState } from "state/definitions";
import { isBaseParentCodeObjImpl } from "utils/generatedTypes";

import { moveParamGroupsWithBackend } from "./paramMoveCommands";
import { type ParamMoveGroup } from "./paramMoveMutations";
import {
  buildVisibleSelectionGroups,
  getParamMovementContext,
} from "./paramMoveQueries";
import { resolveFullIndexForVisibleInsertion } from "./paramTreeSelection";

function insertItems<T>(items: T[], index: number, nextItems: T[]): T[] {
  return [...items.slice(0, index), ...nextItems, ...items.slice(index)];
}

export function moveSelectedParamsUp(): boolean {
  return moveSelectedParamsByOffset(-1);
}

export function moveSelectedParamsDown(): boolean {
  return moveSelectedParamsByOffset(1);
}

function moveSelectedParamsByOffset(direction: -1 | 1): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  const { sectionId, rootSelected, sharedParent, tree } = context;
  let visibleSiblings = tree.visibleChildrenByParent[sharedParent] ?? [];
  if (visibleSiblings.length === 0) {
    return false;
  }
  const selectedSet = new Set(rootSelected);
  const groups = buildVisibleSelectionGroups(visibleSiblings, selectedSet);
  if (groups.length === 0) {
    return false;
  }
  const state = useProjectState.getState();
  const parentImpl = getCurrEffectiveCodeObjImpl(
    state,
    sectionId,
    sharedParent,
  );
  if (!isBaseParentCodeObjImpl(parentImpl)) {
    return false;
  }
  let fullChildren = [...parentImpl.children];
  const groupsToProcess = direction < 0 ? groups : [...groups].reverse();
  const moves: ParamMoveGroup[] = [];

  for (const group of groupsToProcess) {
    const movingIds = new Set(group);
    const firstId = group[0];
    const lastId = group[group.length - 1];
    const firstIndex = visibleSiblings.indexOf(firstId);
    const lastIndex = visibleSiblings.indexOf(lastId);
    if (firstIndex < 0 || lastIndex < 0) {
      continue;
    }

    const remainingVisible = visibleSiblings.filter((id) => !movingIds.has(id));
    let targetVisibleIndex: number | null = null;
    if (direction < 0) {
      let previousSiblingId: string | null = null;
      for (let index = firstIndex - 1; index >= 0; index -= 1) {
        const candidate = visibleSiblings[index];
        if (!selectedSet.has(candidate)) {
          previousSiblingId = candidate;
          break;
        }
      }
      if (!previousSiblingId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(previousSiblingId);
    } else {
      let nextSiblingId: string | null = null;
      for (
        let index = lastIndex + 1;
        index < visibleSiblings.length;
        index += 1
      ) {
        const candidate = visibleSiblings[index];
        if (!selectedSet.has(candidate)) {
          nextSiblingId = candidate;
          break;
        }
      }
      if (!nextSiblingId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(nextSiblingId) + 1;
    }
    if (targetVisibleIndex === null) {
      continue;
    }

    const orderedGroupIds = fullChildren.filter((id) => movingIds.has(id));
    const newIndex = resolveFullIndexForVisibleInsertion({
      targetVisibleIndex,
      movingIds,
      visibleSiblings,
      fullChildren,
    });
    if (newIndex === null) {
      continue;
    }

    moves.push({
      paramIds: orderedGroupIds,
      newParentId: sharedParent,
      newIndex,
    });
    visibleSiblings = insertItems(
      remainingVisible,
      targetVisibleIndex,
      orderedGroupIds,
    );
    fullChildren = insertItems(
      fullChildren.filter((id) => !movingIds.has(id)),
      newIndex,
      orderedGroupIds,
    );
  }

  if (moves.length === 0) {
    return false;
  }
  moveParamGroupsWithBackend({ sectionId, moves });
  return true;
}
