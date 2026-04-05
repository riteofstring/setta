import {
  indentParams,
  moveParamGroups,
  moveParams,
  unindentParams,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  buildParamParentMap,
  buildParamTreeView,
  getParamRootId,
  getRootSelectedParamIds,
  getSharedParentId,
  resolveFullIndexForVisibleInsertion,
} from "state/actions/params/paramTree";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  getCurrShownParamIds,
  setCurrEffectiveCodeObjImplValue,
  toggleParamSelected,
  unselectAllParams,
} from "state/actions/sectionInfos";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import type { ZustandProjectState } from "state/definitions";
import { useProjectState, useShareSession } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
type ParamSelectionBase = {
  sectionId: string;
  rootId: string;
  rootSelected: string[];
  parentById: Record<string, string | null>;
  visibleIds: Set<string>;
};
type ParamMoveGroup = {
  paramIds: string[];
  newParentId: string;
  newIndex: number;
};
function insertItems<T>(arr: T[], index: number, items: T[]): T[] {
  return [...arr.slice(0, index), ...items, ...arr.slice(index)];
}
function applyParamMove(
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
export function selectOnlyParam(sectionId: string, paramId: string) {
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (impl.selectedParams.length === 1 && impl.selectedParams[0] === paramId) {
    return;
  }
  unselectAllParams();
  toggleParamSelected(sectionId, paramId);
}
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
export function moveParamsWithBackend({
  sectionId,
  paramIds,
  newParentId,
  newIndex,
}: {
  sectionId: string;
  paramIds: string[];
  newParentId: string;
  newIndex: number;
}) {
  if (paramIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyParamMove(state, sectionId, {
        paramIds,
        newParentId,
        newIndex,
      });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        moveParams({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            paramIds,
            newParentId,
            newIndex,
            frontendOpId,
          },
        } as Parameters<typeof moveParams>[0]),
      ),
  });
}
function moveParamGroupsWithBackend({
  sectionId,
  moves,
}: {
  sectionId: string;
  moves: ParamMoveGroup[];
}) {
  if (moves.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const move of moves) {
        applyParamMove(state, sectionId, move);
      }
    },
    send: (frontendOpId) =>
      callOpenAPI(
        moveParamGroups({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            moves,
            frontendOpId,
          },
        } as Parameters<typeof moveParamGroups>[0]),
      ),
  });
}
export function indentSelectedParams(): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  callOpenAPI(
    indentParams({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId: context.sectionId,
        paramIds: context.rootSelected,
      },
    } as Parameters<typeof indentParams>[0]),
  );
  return true;
}
export function unindentSelectedParams(): boolean {
  const context = getParamUnindentContext();
  if (!context) {
    return false;
  }
  callOpenAPI(
    unindentParams({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId: context.sectionId,
        paramIds: context.rootSelected,
      },
    } as Parameters<typeof unindentParams>[0]),
  );
  return true;
}
export function moveSelectedParamsUp(): boolean {
  return moveSelectedParamsByOffset(-1);
}
export function moveSelectedParamsDown(): boolean {
  return moveSelectedParamsByOffset(1);
}
function buildVisibleSelectionGroups(
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
      let prevId: string | null = null;
      for (let i = firstIndex - 1; i >= 0; i -= 1) {
        const candidate = visibleSiblings[i];
        if (!selectedSet.has(candidate)) {
          prevId = candidate;
          break;
        }
      }
      if (!prevId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(prevId);
    } else {
      let nextId: string | null = null;
      for (let i = lastIndex + 1; i < visibleSiblings.length; i += 1) {
        const candidate = visibleSiblings[i];
        if (!selectedSet.has(candidate)) {
          nextId = candidate;
          break;
        }
      }
      if (!nextId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(nextId) + 1;
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
function getParamSelectionBase(): ParamSelectionBase | null {
  if (useShareSession.getState().isDeploymentMode) {
    return null;
  }
  const state = useProjectState.getState();
  const selectedSectionId = resolveSectionWithSelectedParams(state);
  if (!selectedSectionId) {
    return null;
  }
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    selectedSectionId,
    isBaseSectionWithParamsImpl,
  );
  if (sectionImpl.paramFilter.trim().length > 0) {
    addTemporaryNotification("Param move disabled while filter is active.");
    return null;
  }
  const selectedParams = sectionImpl.selectedParams ?? [];
  if (selectedParams.length === 0) {
    return null;
  }
  const rootId = getParamRootId(state, selectedSectionId);
  const parentById = buildParamParentMap(state, selectedSectionId, rootId);
  const rootSelected = getRootSelectedParamIds(parentById, selectedParams);
  if (rootSelected.length === 0) {
    return null;
  }
  const visibleIds = buildVisibleParamIdSet(state, selectedSectionId);
  for (const selectedId of rootSelected) {
    if (!visibleIds.has(selectedId)) {
      addTemporaryNotification("Param move disabled for hidden params.");
      return null;
    }
  }
  return {
    sectionId: selectedSectionId,
    rootId,
    rootSelected,
    parentById,
    visibleIds,
  };
}
function getParamMovementContext(): {
  sectionId: string;
  rootSelected: string[];
  sharedParent: string;
  tree: ReturnType<typeof buildParamTreeView>;
} | null {
  const base = getParamSelectionBase();
  if (!base) {
    return null;
  }
  const sharedParent = getSharedParentId(base.parentById, base.rootSelected);
  if (!sharedParent) {
    addTemporaryNotification("Param selection spans multiple parents.");
    return null;
  }
  const state = useProjectState.getState();
  const rootImpl = getCurrEffectiveCodeObjImpl(
    state,
    base.sectionId,
    base.rootId,
  );
  const topLevelParamIds = isBaseParentCodeObjImpl(rootImpl)
    ? rootImpl.children.filter((id) => base.visibleIds.has(id))
    : [];
  const visibleMap: Record<string, string[]> = {};
  for (const id of base.visibleIds) {
    visibleMap[id] = [];
  }
  const tree = buildParamTreeView(
    state,
    base.sectionId,
    topLevelParamIds,
    visibleMap,
  );
  return {
    sectionId: base.sectionId,
    rootSelected: base.rootSelected,
    sharedParent,
    tree,
  };
}
function getParamUnindentContext(): {
  sectionId: string;
  rootSelected: string[];
} | null {
  const base = getParamSelectionBase();
  if (!base) {
    return null;
  }
  return { sectionId: base.sectionId, rootSelected: base.rootSelected };
}
function resolveSectionWithSelectedParams(
  state: ZustandProjectState,
): string | null {
  const activeId = getActiveSectionUIIds()[0] ?? null;
  if (activeId) {
    const impl = getCurrEffectiveSectionImpl(state, activeId);
    if (isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0) {
      return activeId;
    }
  }
  for (const sectionId of Object.keys(state.sections)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0) {
      return sectionId;
    }
  }
  return null;
}
function buildVisibleParamIdSet(
  state: ZustandProjectState,
  sectionId: string,
): Set<string> {
  const pinned = getCurrShownParamIds(state, sectionId, true);
  const unpinned = getCurrShownParamIds(state, sectionId, false);
  const visibleIds = new Set<string>([
    ...Object.keys(pinned.requiredParamIdsToPaths),
    ...Object.keys(unpinned.requiredParamIdsToPaths),
  ]);
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  for (const edgeParam of impl.edgeInputParams) {
    visibleIds.delete(edgeParam);
  }
  return visibleIds;
}
