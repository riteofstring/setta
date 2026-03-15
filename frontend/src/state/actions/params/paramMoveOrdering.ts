import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionEffectiveImpls";
import type { ZustandProjectState } from "state/definitions";
import { isBaseParentCodeObjImpl } from "utils/generatedTypes";

export function orderParamIdsByParent(
  state: ZustandProjectState,
  sectionId: string,
  parentId: string,
  paramIds: string[],
): string[] {
  const parentImpl = getCurrEffectiveCodeObjImpl(state, sectionId, parentId);
  if (!isBaseParentCodeObjImpl(parentImpl)) {
    return paramIds;
  }

  const paramSet = new Set(paramIds);
  return parentImpl.children.filter((id) => paramSet.has(id));
}

export function buildVisibleSelectionGroups(
  visibleSiblings: string[],
  selectedSet: Set<string>,
): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const id of visibleSiblings) {
    if (selectedSet.has(id)) {
      current.push(id);
      continue;
    }
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}
