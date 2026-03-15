import { addTemporaryNotification } from "state/actions/notifications";
import {
  getRootSelectedParamIds,
  getSharedParentId,
} from "state/actions/params/paramTreeSelection";
import {
  buildParamParentMap,
  buildParamTreeView,
  getParamRootId,
} from "state/actions/params/paramTreeStructure";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionEffectiveImpls";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import { getCurrShownParamIds } from "state/actions/sectionShownParams";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import {
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

export type ParamMovementContext = {
  sectionId: string;
  rootSelected: string[];
  sharedParent: string;
  tree: ReturnType<typeof buildParamTreeView>;
};

export type ParamUnindentContext = {
  sectionId: string;
  rootSelected: string[];
};

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

export function getParamSelectionBase(): ParamSelectionBase | null {
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

export function getParamMovementContext(): ParamMovementContext | null {
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

export function getParamUnindentContext(): ParamUnindentContext | null {
  const base = getParamSelectionBase();
  if (!base) {
    return null;
  }
  return { sectionId: base.sectionId, rootSelected: base.rootSelected };
}

export function resolveSectionWithSelectedParams(
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

export function buildVisibleParamIdSet(
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
