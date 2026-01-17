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
  getCurrShownParamIds,
  setCurrEffectiveCodeObjImplValue,
  toggleParamSelected,
  unselectAllParams,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { useProjectState } from "state/definitions";
import {
  route_indent_params,
  route_move_params,
  route_unindent_params,
} from "utils/generatedEndpoints";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";

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
      const rootId = getParamRootId(state, sectionId);
      const parentById = buildParamParentMap(state, sectionId, rootId);
      const oldParentId = parentById[paramIds[0]] ?? null;
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
        paramIds,
      );
      const paramSet = new Set(orderedParamIds);
      const remaining = oldParentImpl.children.filter(
        (id) => !paramSet.has(id),
      );

      if (newParentId === oldParentId) {
        if (newIndex < 0 || newIndex > remaining.length) {
          return;
        }
        const nextChildren = insertIntoArray(
          remaining,
          newIndex,
          orderedParamIds,
        );
        setCurrEffectiveCodeObjImplValue(state, sectionId, oldParentId, {
          children: nextChildren,
        });
        return;
      }

      const newParentImpl = getCurrEffectiveCodeObjImpl(
        state,
        sectionId,
        newParentId,
      );
      if (!isBaseParentCodeObjImpl(newParentImpl)) {
        return;
      }
      const newRemaining = newParentImpl.children.filter(
        (id) => !paramSet.has(id),
      );
      if (newIndex < 0 || newIndex > newRemaining.length) {
        return;
      }
      const nextNewChildren = insertIntoArray(
        newRemaining,
        newIndex,
        orderedParamIds,
      );
      setCurrEffectiveCodeObjImplValue(state, sectionId, oldParentId, {
        children: remaining,
      });
      setCurrEffectiveCodeObjImplValue(state, sectionId, newParentId, {
        children: nextNewChildren,
      });
    },
    send: (frontendOpId) =>
      route_move_params({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramIds,
        newParentId,
        newIndex,
        frontendOpId,
      }),
  });
}

export function indentSelectedParams(): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  route_indent_params({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: context.sectionId,
    paramIds: context.rootSelected,
  });
  return true;
}

export function unindentSelectedParams(): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  route_unindent_params({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: context.sectionId,
    paramIds: context.rootSelected,
  });
  return true;
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
  const visibleSiblings = tree.visibleChildrenByParent[sharedParent] ?? [];
  if (visibleSiblings.length === 0) {
    return false;
  }
  const selectedSet = new Set(rootSelected);
  const orderedVisibleSelected = visibleSiblings.filter((id) =>
    selectedSet.has(id),
  );
  if (orderedVisibleSelected.length === 0) {
    return false;
  }
  const firstSelectedId = orderedVisibleSelected[0];
  const lastSelectedId =
    orderedVisibleSelected[orderedVisibleSelected.length - 1];
  const firstIndex = visibleSiblings.indexOf(firstSelectedId);
  const lastIndex = visibleSiblings.indexOf(lastSelectedId);
  if (firstIndex < 0 || lastIndex < 0) {
    return false;
  }
  const remainingVisible = visibleSiblings.filter((id) => !selectedSet.has(id));
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
      return false;
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
      return false;
    }
    targetVisibleIndex = remainingVisible.indexOf(nextId) + 1;
  }
  if (targetVisibleIndex === null) {
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
  const orderedIds = orderParamIdsByParent(
    state,
    sectionId,
    sharedParent,
    rootSelected,
  );
  const newIndex = resolveFullIndexForVisibleInsertion({
    targetVisibleIndex,
    movingIds: new Set(orderedIds),
    visibleSiblings,
    fullChildren: parentImpl.children,
  });
  if (newIndex === null) {
    return false;
  }
  moveParamsWithBackend({
    sectionId,
    paramIds: orderedIds,
    newParentId: sharedParent,
    newIndex,
  });
  return true;
}

function getParamMovementContext(): {
  sectionId: string;
  rootSelected: string[];
  sharedParent: string;
  tree: ReturnType<typeof buildParamTreeView>;
} | null {
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
  const sharedParent = getSharedParentId(parentById, rootSelected);
  if (!sharedParent) {
    addTemporaryNotification("Param selection spans multiple parents.");
    return null;
  }

  const visibleIds = buildVisibleParamIdSet(state, selectedSectionId);
  for (const selectedId of rootSelected) {
    if (!visibleIds.has(selectedId)) {
      addTemporaryNotification("Param move disabled for hidden params.");
      return null;
    }
  }
  const rootImpl = getCurrEffectiveCodeObjImpl(
    state,
    selectedSectionId,
    rootId,
  );
  const topLevelParamIds = isBaseParentCodeObjImpl(rootImpl)
    ? rootImpl.children.filter((id) => visibleIds.has(id))
    : [];
  const visibleMap: Record<string, string[]> = {};
  for (const id of visibleIds) {
    visibleMap[id] = [];
  }
  const tree = buildParamTreeView(
    state,
    selectedSectionId,
    topLevelParamIds,
    visibleMap,
  );
  return {
    sectionId: selectedSectionId,
    rootSelected,
    sharedParent,
    tree,
  };
}

function resolveSectionWithSelectedParams(
  state: ZustandProjectState,
): string | null {
  const activeId = state.projectConfig.activeIds[0] ?? null;
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
