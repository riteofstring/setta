import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import {
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_json_source_path_to_be_deleted } from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  ImplLayering,
  isBaseParentSectionImpl,
  ProjectStateSingleConfig,
  ViewingEditingMode,
  ViewingEditingModeEnum,
} from "utils/generatedTypes";
import { openDeleteJSONSourceFileModal } from "./modal";
import { waitForFileDeletion } from "./temporaryMiscState";

// Generic function with constraints
export function getEffectiveImpl<TImpl>(
  implLayering: ImplLayering,
  implDict: Record<string, TImpl>,
): TImpl {
  const baseImpl = implDict[implLayering.impl];
  if (!baseImpl) {
    throw new Error();
  }
  // Deep clone the base implementation
  const effective = _.cloneDeep(baseImpl);
  Object.assign(effective, implLayering.modifier);
  return effective;
}

export function getSectionImplLayering(
  p: ZustandProjectState,
  sectionId: string,
) {
  // Check if sectionId exists in the map
  const implLayeringId = p.projectConfig.sectionImplLayeringMap[sectionId];
  if (implLayeringId === undefined) {
    throw new Error(
      `Section ID '${sectionId}' not found in sectionImplLayeringMap`,
    );
  }

  // Check if implLayeringId exists in layerings
  const implLayering = p.sectionImplLayerings[implLayeringId];
  if (!implLayering) {
    throw new Error(`Implementation layering '${implLayeringId}' not found`);
  }
  return implLayering;
}

export function getEffectiveSectionImpl(
  p: ZustandProjectState,
  sectionId: string | null = null,
  sectionImpl: BaseSectionImplUnion | null = null,
) {
  if (sectionImpl === null) {
    if (sectionId === null) {
      throw new Error("Either section_id or section_impl must be provided");
    }

    const implLayering = getSectionImplLayering(p, sectionId);
    return getEffectiveImpl(implLayering, p.sectionImpls);
  }
  return sectionImpl;
}

export function getSectionImpl(p: ZustandProjectState, sectionId: string) {
  const implLayering = getSectionImplLayering(p, sectionId);
  const baseImpl = p.sectionImpls[implLayering.impl];
  if (!baseImpl) {
    throw new Error();
  }
  return baseImpl;
}

export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
}

export function getSectionParentId(sectionId: string) {
  return getEffectiveSectionImpl(useProjectState.getState(), sectionId)
    .parentId;
}

export function getSectionType(sectionId, _state = null) {
  const state = _state ?? useProjectState.getState();
  return state.uiTypes[state.sections[sectionId].uiTypeId].type;
}

export function getSectionVariant(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.variants[getCurrentSectionConfigs(state)[sectionId].variantId];
}

export function getHighestAncestor(
  sectionId: string,
  parentIdGetter: (id: string) => string | null = getSectionParentId,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getSectionDescendants(
  sectionId: string,
  state: ZustandProjectState,
) {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId) {
      const impl = getEffectiveSectionImpl(state, currId);
      if (isBaseParentSectionImpl(impl)) {
        ids.push(...impl.children);
      }
    }
    idx += 1;
  }
  return ids;
}

export function manualDndChildrenReset() {
  useDndChildren.getState().update(getDisplayedSectionIdToChildren());
}

export function setAllPreviewVariantIdsToNull() {
  useProjectState.setState((x) => {
    for (const s of Object.values(x.sections)) {
      s.previewVariantId = null;
    }
  });
}

export function processProjectStateUpdateFromBackend(
  projectState: ProjectStateSingleConfig,
) {
  if (
    projectState.projectConfig.id !==
    useProjectState.getState().projectConfig.id
  ) {
    return;
  }
  useProjectState.setState(projectState);
  useNodeInternals.setState({
    x: createNodesMapFromProjectConfigChildren(
      projectState.projectConfig,
      projectState.sections,
    ),
  });
}

export function updateProjectState({
  sections,
  variants,
  uiTypes,
  uiTypeCols,
  codeInfo,
  codeInfoCols,
  state,
}) {
  state.sections = { ...state.sections, ...sections };
  state.variants = { ...state.variants, ...variants };
  state.uiTypes = { ...state.uiTypes, ...uiTypes };
  state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  state.codeInfo = { ...state.codeInfo, ...codeInfo };
  state.codeInfoCols = { ...state.codeInfoCols, ...codeInfoCols };
}

export function createNodesMapFromProjectConfigChildren(
  p: ZustandProjectState,
) {
  const nodesMap = new Map();
  const visibilityKey = getSectionVisibilityKeyForDisplay(
    p.projectConfig.viewingEditingMode,
  );

  for (const [k, v] of Object.entries(p.projectConfig.topLevelSections)) {
    const impl = getEffectiveSectionImpl(p, k);
    nodesMap.set(k, {
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
      visibility: impl.visibility[visibilityKey],
    });
  }

  return nodesMap;
}

export function setEnteredValue(variantId, paramInfoId, value, state) {
  if (!(paramInfoId in state.variants[variantId].values)) {
    state.variants[variantId].values[paramInfoId] = createEVEntry();
  }
  state.variants[variantId].values[paramInfoId].value = value;
}

export function setParamEnteredValue(sectionId, paramInfoId, value, state) {
  setEnteredValue(
    state.sections[sectionId].variantId,
    paramInfoId,
    value,
    state,
  );
}

export function getCodeInfoCol(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  const codeInfoColId = getSectionVariant(sectionId, state).codeInfoColId;
  return codeInfoColId
    ? state.codeInfoCols[codeInfoColId]
    : createCodeInfoCol();
}

export function getDisplayedCodeInfoCol(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.codeInfoCols[
    getDisplayedSectionVariant(sectionId, state).codeInfoColId
  ];
}

export function getDisplayedSectionVariant(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.variants[getDisplayedSectionVariantId(sectionId, state)];
}

export function getDisplayedSectionVariantId(
  sectionId: string,
  _state: ZustandProjectState | null,
) {
  const state = _state ?? useProjectState.getState();
  return (
    state.sections[sectionId].previewVariantId ??
    getCurrentSectionConfigs(state)[sectionId].variantId
  );
}

export function setSectionVariantChildren(sectionId, newStateFn, state) {
  const variant = getSectionVariant(sectionId, state);
  variant.children = newStateFn(variant.children);
}

function getDisplayedSectionIdToChildrenHelper(
  sectionId: string,
  sectionImpl: BaseSectionImplUnion,
  state: ZustandProjectState,
  output: Record<string, Array<string>>,
) {
  if (isBaseParentSectionImpl(sectionImpl)) {
    const { children } = sectionImpl;
    output[sectionId] = children;
    for (const childId of children) {
      const childImpl = getEffectiveSectionImpl(state, childId);
      getDisplayedSectionIdToChildrenHelper(childId, childImpl, state, output);
    }
  } else {
    output[sectionId] = [];
  }
}

export function getDisplayedSectionIdToChildren(state: ZustandProjectState) {
  const output: Record<string, Array<string>> = {};
  for (const sectionId of Object.keys(state.projectConfig.topLevelSections)) {
    const impl = getEffectiveSectionImpl(state, sectionId);
    getDisplayedSectionIdToChildrenHelper(sectionId, impl, state, output);
  }
  return output;
}

function getSectionDescendantsFromAllVariants(
  sectionId: string,
  state: ZustandProjectState,
) {
  const output: Array<string> = [];
  const section = state.sections[sectionId];
  if (!section) {
    throw new Error();
  }
  for (const layeringId of section.implLayerings) {
    const implLayering = state.sectionImplLayerings[layeringId];
    if (!implLayering) {
      throw new Error();
    }
    const impl = getEffectiveImpl(implLayering, state.sectionImpls);
    if (isBaseParentSectionImpl(impl)) {
      output.push(...impl.children);
    }
  }
  return output;
}

export function getAllSectionsForDeletionOrCopying(
  sectionIds: Array<string>,
  state: ZustandProjectState,
) {
  const idsToDelete = [...sectionIds];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const idxChildren = getSectionDescendantsFromAllVariants(
      idsToDelete[idx],
      state,
    );
    if (idxChildren) {
      idsToDelete.push(...idxChildren);
    }
    idx += 1;
  }
  return idsToDelete;
}

export function resetSectionsToDefaultVersions(sectionIds) {
  useProjectState.setState((x) => {
    for (const id of sectionIds) {
      const s = x.sections[id];
      s.variantId = s.defaultVariantId;
    }
  });
}

export function resetAllSectionsToDefaultVersions() {
  resetSectionsToDefaultVersions(
    Object.keys(useProjectState.getState().sections),
  );
}

export function getCodeChildrenAndParentCodeInfoId(
  sectionId,
  state,
  variantId = null,
) {
  const sectionVariant = variantId
    ? state.variants[variantId]
    : getDisplayedSectionVariant(sectionId, state);
  const { codeInfoColId } = sectionVariant;
  const parentCodeInfoId = sectionVariant.selectedItem;

  const codeInfoChildren = codeInfoColId
    ? state.codeInfoCols[codeInfoColId].children
    : createCodeInfoCol().children;

  return { codeInfoChildren, parentCodeInfoId };
}

export async function deleteSectionVariantAndMaybeJsonFile(
  sectionId,
  variantId,
  isCurr,
) {
  const state = useProjectState.getState();
  const { name: variantName, isJsonSource } = state.variants[variantId];
  if (isJsonSource) {
    const res = await route_get_json_source_path_to_be_deleted({ variantName });
    if (res200(res)) {
      openDeleteJSONSourceFileModal(res.data);
      const wasDeleted = await waitForFileDeletion(res.data);
      if (wasDeleted) {
        deleteSectionVariant(sectionId, variantId, isCurr);
      }
    }
  } else {
    deleteSectionVariant(sectionId, variantId, isCurr);
  }
}

function deleteSectionVariant(sectionId, variantId, isCurr) {
  useProjectState.setState((state) => {
    const section = state.sections[sectionId];
    section.variantIds = section.variantIds.filter((v) => v !== variantId);
    if (section.defaultVariantId === variantId) {
      section.defaultVariantId = section.variantIds[0];
    }
    if (isCurr) {
      section.variantId = section.variantIds[0];
    }
    delete state.variants[variantId];
  });
}

export function getSectionShouldRender(
  visibility: boolean,
  viewingEditingMode: ViewingEditingMode,
) {
  return visibility || viewingEditingMode !== ViewingEditingModeEnum.USER;
}

export function getSectionViewingEditingModeVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { viewingEditingMode } = state.projectConfig;
  const sectionImpl = getEffectiveSectionImpl(state, sectionId);
  const visibility =
    sectionImpl.visibility[getSectionVisibilityKey(viewingEditingMode)];
  return {
    visibility,
    viewingEditingMode,
  };
}

export function getSectionVisibilityKey(
  viewingEditingMode: ViewingEditingMode,
) {
  switch (viewingEditingMode) {
    case ViewingEditingModeEnum.DEV:
    case ViewingEditingModeEnum.USER:
      return viewingEditingMode;
    case ViewingEditingModeEnum.USER_EDIT:
      return ViewingEditingModeEnum.USER;
    default:
      return viewingEditingMode satisfies never;
  }
}

export function getSectionVisibilityKeyForDisplay(
  viewingEditingMode: ViewingEditingMode,
) {
  switch (viewingEditingMode) {
    case ViewingEditingModeEnum.USER:
      return viewingEditingMode;
    case ViewingEditingModeEnum.DEV:
    case ViewingEditingModeEnum.USER_EDIT:
      return ViewingEditingModeEnum.DEV;
    default:
      return viewingEditingMode satisfies never;
  }
}

export function getAncestorSameVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { viewingEditingMode } = state.projectConfig;
  let impl = getEffectiveSectionImpl(state, sectionId);
  let { parentId } = impl;
  const key = getSectionVisibilityKey(viewingEditingMode);
  const targetVisibility = impl.visibility[key];

  while (parentId) {
    impl = getEffectiveSectionImpl(state, parentId);
    if (impl.visibility[key] === targetVisibility) {
      return true;
    }

    ({ parentId } = impl);
  }

  return false;
}

export function getCurrentSectionConfigs(
  _state: ZustandProjectState | null = null,
) {
  const state = _state ?? useProjectState.getState();
  return state.projectConfig.sectionConfigs;
}
