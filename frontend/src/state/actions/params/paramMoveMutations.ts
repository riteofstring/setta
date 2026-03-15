import {
  buildParamParentMap,
  getParamRootId,
} from "state/actions/params/paramTreeStructure";
import { setCurrEffectiveCodeObjImplValue } from "state/actions/sectionEffectiveImplMutations";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrSectionVariantId,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { CodeObjTypeEnum, isBaseParentCodeObjImpl } from "utils/generatedTypes";
import { orderParamIdsByParent } from "./paramMoveQueries";

export type ParamMoveGroup = {
  paramIds: string[];
  newParentId: string;
  newIndex: number;
};

function insertItems<T>(arr: T[], index: number, items: T[]): T[] {
  return [...arr.slice(0, index), ...items, ...arr.slice(index)];
}

export function applyParamMove(
  state: ZustandProjectState,
  sectionId: string,
  move: ParamMoveGroup,
) {
  if (move.paramIds.length === 0) {
    return;
  }
  const rootId = getParamRootId(state, sectionId);
  const parentById = buildParamParentMap(state, sectionId, rootId);
  const oldParentId = parentById[move.paramIds[0]] ?? null;
  if (!oldParentId) {
    return;
  }
  const oldParentImpl = getCurrEffectiveCodeObjImpl(
    state,
    sectionId,
    oldParentId,
  );
  if (!isBaseParentCodeObjImpl(oldParentImpl)) {
    return;
  }
  const orderedParamIds = orderParamIdsByParent(
    state,
    sectionId,
    oldParentId,
    move.paramIds,
  );
  const paramSet = new Set(orderedParamIds);
  const remaining = oldParentImpl.children.filter((id) => !paramSet.has(id));

  if (move.newParentId === oldParentId) {
    if (move.newIndex < 0 || move.newIndex > remaining.length) {
      return;
    }
    const nextChildren = insertItems(remaining, move.newIndex, orderedParamIds);
    setCurrEffectiveCodeObjImplValue(state, sectionId, oldParentId, {
      children: nextChildren,
    });
    syncShownParamTopLevelOrder(state, sectionId);
    return;
  }

  const newParentImpl = getCurrEffectiveCodeObjImpl(
    state,
    sectionId,
    move.newParentId,
  );
  const resolvedNewParentImpl = ensureParentParamImpl(
    state,
    sectionId,
    move.newParentId,
    newParentImpl,
  );
  if (!resolvedNewParentImpl) {
    return;
  }
  const newRemaining = resolvedNewParentImpl.children.filter(
    (id) => !paramSet.has(id),
  );
  if (move.newIndex < 0 || move.newIndex > newRemaining.length) {
    return;
  }
  const nextNewChildren = insertItems(
    newRemaining,
    move.newIndex,
    orderedParamIds,
  );
  setCurrEffectiveCodeObjImplValue(state, sectionId, oldParentId, {
    children: remaining,
  });
  setCurrEffectiveCodeObjImplValue(state, sectionId, move.newParentId, {
    children: nextNewChildren,
  });
  syncShownParamTopLevelOrder(state, sectionId);
}

function ensureParentParamImpl(
  state: ZustandProjectState,
  sectionId: string,
  paramId: string,
  currentImpl: ReturnType<typeof getCurrEffectiveCodeObjImpl>,
) {
  if (isBaseParentCodeObjImpl(currentImpl)) {
    return currentImpl;
  }
  setCurrEffectiveCodeObjImplValue(state, sectionId, paramId, {
    type: CodeObjTypeEnum.NestedParam,
    children: [],
  });
  const nextImpl = getCurrEffectiveCodeObjImpl(state, sectionId, paramId);
  if (!isBaseParentCodeObjImpl(nextImpl)) {
    return null;
  }
  return nextImpl;
}

function syncShownParamTopLevelOrder(
  state: ZustandProjectState,
  sectionId: string,
) {
  const variantId = getCurrSectionVariantId(state, sectionId);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    return;
  }
  const rootId = getParamRootId(state, sectionId);
  const rootImpl = getCurrEffectiveCodeObjImpl(state, sectionId, rootId);
  if (!isBaseParentCodeObjImpl(rootImpl)) {
    return;
  }
  const rootChildren = rootImpl.children;
  shown.pinned.topLevelParamIds = filterTopLevelIds(
    rootChildren,
    shown.pinned.requiredParamIdsToPaths,
  );
  shown.unpinned.topLevelParamIds = filterTopLevelIds(
    rootChildren,
    shown.unpinned.requiredParamIdsToPaths,
  );
}

function filterTopLevelIds(
  rootChildren: string[],
  requiredParamIdsToPaths: Record<string, string[]>,
): string[] {
  if (rootChildren.length === 0) {
    return [];
  }
  const included = new Set(Object.keys(requiredParamIdsToPaths));
  return rootChildren.filter((id) => included.has(id));
}
