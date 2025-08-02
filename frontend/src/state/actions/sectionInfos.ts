import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import {
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_sections,
  route_get_json_source_path_to_be_deleted,
} from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  Core,
  ImplArgsBundleMap,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  Layering,
  ProjectStateSingleConfig,
  ViewingEditingMode,
  ViewingEditingModeEnum,
} from "utils/generatedTypes";
import { openDeleteJSONSourceFileModal } from "./modal";
import { waitForFileDeletion } from "./temporaryMiscState";

// Generic function with constraints
export function getEffectiveImpl<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  layering: Layering,
): ImplArgsBundleMap[K]["impl"] {
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...core.sharedModifier, ...layering.modifier });
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
    const baseImpl = p.sectionImpls[implLayering.impl];
    const core = p.sections[sectionId];
    if (!baseImpl || !core) {
      throw new Error();
    }
    return getEffectiveImpl<"BaseSectionUnion">(baseImpl, core, implLayering);
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

export function getCodeObjImplLayering(
  p: ZustandProjectState,
  codeObjId: string,
  sectionId: string | null,
  sectionImpl: BaseSectionImplUnion | null,
) {
  // Check if sectionId exists in the map
  sectionImpl = getEffectiveSectionImpl(p, sectionId, sectionImpl);
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    throw new Error();
  }
  const implLayeringId = sectionImpl.codeObjImplLayeringMap[codeObjId];
  if (implLayeringId === undefined) {
    throw new Error(
      `Section ID '${sectionId}' not found in sectionImplLayeringMap`,
    );
  }

  // Check if implLayeringId exists in layerings
  const implLayering = p.codeObjImplLayerings[implLayeringId];
  if (!implLayering) {
    throw new Error(`Implementation layering '${implLayeringId}' not found`);
  }
  return implLayering;
}

export function getEffectiveCodeObjImpl(
  p: ZustandProjectState,
  codeObjId: string,
  sectionId: string | null,
  sectionImpl: BaseSectionImplUnion | null,
) {
  const implLayering = getCodeObjImplLayering(
    p,
    codeObjId,
    sectionId,
    sectionImpl,
  );
  const baseImpl = p.codeObjImpls[implLayering.impl];
  const core = p.codeObjs[codeObjId];
  if (!baseImpl || !core) {
    throw new Error();
  }
  return getEffectiveImpl<"BaseCodeObjUnion">(baseImpl, core, implLayering);
}

export function getEffectiveImplFromLayeringMap(
  id: string,
  impls: ZustandProjectState["codeObjImpls"],
  cores: ZustandProjectState["codeObjs"],
  layerings: ZustandProjectState["codeObjImplLayerings"],
  layeringMap: Record<string, string>,
) {
  const layeringId = layeringMap[id];
  const implLayering = layerings[layeringId];
  if (!implLayering) {
    throw new Error();
  }
  const baseImpl = impls[implLayering.impl];
  const core = cores[id];
  if (!baseImpl || !core) {
    throw new Error();
  }
  return getEffectiveImpl<"BaseCodeObjUnion">(baseImpl, core, implLayering);
}

export function setEffectiveImplValue<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  layering: Layering,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  for (const [k, v] of Object.entries(args)) {
    // Resolve the value if it's a function
    const resolvedValue =
      typeof v === "function"
        ? v(impl[k]) // Pass the current value to the updater
        : v;

    if (!impl.isPreset) {
      impl[k] = resolvedValue;
    } else if (core.unsharedKeys.includes(k)) {
      layering.modifier[k] = resolvedValue;
    } else {
      core.sharedModifier[k] = resolvedValue;
    }
  }
  return getEffectiveImpl(impl, core, layering);
}

export function setEffectiveSectionImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const bundle = getSectionImplCoreLayeringBundle<K>(state, sectionId);
  return setEffectiveImplValue<K>(
    bundle.impl,
    bundle.core,
    bundle.layering,
    args,
  );
}

export function getSectionImplCoreLayeringBundle<
  K extends keyof ImplArgsBundleMap,
>(
  p: ZustandProjectState,
  sectionId: string,
): {
  impl: ImplArgsBundleMap[K]["impl"];
  core: Core;
  layering: Layering;
} {
  const layering = getSectionImplLayering(p, sectionId);
  const impl = p.sectionImpls[layering.impl];
  const core = p.sections[sectionId];

  if (!impl || !core) {
    throw new Error(`Missing section data for sectionId: ${sectionId}`);
  }

  return { impl, core, layering };
}

export function setEffectiveCodeObjImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const bundle = getCodeObjImplCoreLayeringBundle<K>(
    state,
    sectionId,
    codeObjId,
  );
  return setEffectiveImplValue<K>(
    bundle.impl,
    bundle.core,
    bundle.layering,
    args,
  );
}

export function getCodeObjImplCoreLayeringBundle<
  K extends keyof ImplArgsBundleMap,
>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
): {
  impl: ImplArgsBundleMap[K]["impl"];
  core: Core;
  layering: Layering;
} {
  const layering = getCodeObjImplLayering(p, codeObjId, sectionId, null);
  const impl = p.codeObjImpls[layering.impl];
  const core = p.codeObjs[codeObjId];

  if (!impl || !core) {
    throw new Error(`Missing section data for sectionId: ${sectionId}`);
  }

  return { impl, core, layering };
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
    x: createNodesMapFromProjectConfigChildren(useProjectState.getState()),
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

export function getCodeInfoCol(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  const codeInfoColId = getSectionVariant(sectionId, state).codeInfoColId;
  return codeInfoColId
    ? state.codeInfoCols[codeInfoColId]
    : createCodeInfoCol();
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

export function deleteAllActiveSections() {
  route_delete_sections({
    projectConfigId: useProjectState.getState().projectConfig.id,
    sectionIds: useProjectState.getState().activeIds,
  });
}
