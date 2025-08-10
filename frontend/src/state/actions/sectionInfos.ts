import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import {
  useNodeInternals,
  useProjectState,
  ZustandNodeInternalsState,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_sections,
  route_get_json_source_path_to_be_deleted,
  route_update_from_frontend_top_level_section_layout,
} from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  Core,
  ImplArgsBundleMap,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ProjectStateSingleConfig,
  Variant,
  ViewingEditingMode,
  ViewingEditingModeEnum,
} from "utils/generatedTypes";
import { openDeleteJSONSourceFileModal } from "./modal";
import { waitForFileDeletion } from "./temporaryMiscState";

// Generic function with constraints
export function getEffectiveImpl<T>(impl: T, core: Core, variant: Variant): T {
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...core.sharedModifier, ...variant.modifier });
  return effective;
}

export function getCurrSectionVariant(
  p: ZustandProjectState,
  sectionId: string,
) {
  const variantId = p.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    throw new Error();
  }
  return getSectionVariant(p, variantId);
}

export function getEffectiveSectionImpl(
  p: ZustandProjectState,
  sectionId: string,
) {
  const variant = getCurrSectionVariant(p, sectionId);
  const baseImpl = getBaseSectionImpl(p, variant.impl);
  const core = getSectionCore(p, sectionId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrCodeObjVariant(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
) {
  // Check if sectionId exists in the map
  const sectionImpl = getEffectiveSectionImpl(p, sectionId);
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    throw new Error();
  }
  const variantId = sectionImpl.codeObjVariantMap[codeObjId];
  if (variantId === undefined) {
    throw new Error();
  }
  return getCodeObjVariant(p, variantId);
}

export function getEffectiveCodeObjImpl(
  p: ZustandProjectState,
  codeObjId: string,
  sectionId: string,
) {
  const variant = getCurrCodeObjVariant(p, sectionId, codeObjId);
  const baseImpl = getBaseCodeObjImpl(p, variant.impl);
  const core = getCodeObjCore(p, codeObjId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getEffectiveImplFromVariantMap(
  id: string,
  impls: ZustandProjectState["codeObjImpls"],
  cores: ZustandProjectState["codeObjs"],
  variants: ZustandProjectState["codeObjVariants"],
  variantMap: Record<string, string>,
) {
  const variantId = variantMap[id];
  const variant = variants[variantId];
  if (!variant) {
    throw new Error();
  }
  const baseImpl = impls[variant.impl];
  const core = cores[id];
  if (!baseImpl || !core) {
    throw new Error();
  }
  return getEffectiveImpl(baseImpl, core, variant);
}

export function setEffectiveImplValue<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  variant: Variant,
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
      variant.modifier[k] = resolvedValue;
    } else {
      core.sharedModifier[k] = resolvedValue;
    }
  }
  return getEffectiveImpl(impl, core, variant);
}

export function setEffectiveSectionImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const bundle = getSectionImplCoreVariantBundle<K>(state, sectionId);
  return setEffectiveImplValue<K>(
    bundle.impl,
    bundle.core,
    bundle.variant,
    args,
  );
}

export function getSectionImplCoreVariantBundle<
  K extends keyof ImplArgsBundleMap,
>(
  p: ZustandProjectState,
  sectionId: string,
): {
  impl: ImplArgsBundleMap[K]["impl"];
  core: Core;
  variant: Variant;
} {
  const variant = getCurrSectionVariant(p, sectionId);
  const impl = p.sectionImpls[variant.impl];
  const core = getSectionCore(p, sectionId);

  if (!impl) {
    throw new Error(`Missing section data for sectionId: ${sectionId}`);
  }

  return { impl, core, variant };
}

export function setEffectiveCodeObjImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const bundle = getCodeObjImplCoreVariantBundle<K>(
    state,
    sectionId,
    codeObjId,
  );
  return setEffectiveImplValue<K>(
    bundle.impl,
    bundle.core,
    bundle.variant,
    args,
  );
}

export function getCodeObjImplCoreVariantBundle<
  K extends keyof ImplArgsBundleMap,
>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
): {
  impl: ImplArgsBundleMap[K]["impl"];
  core: Core;
  variant: Variant;
} {
  const variant = getCurrCodeObjVariant(p, sectionId, codeObjId);
  const impl = p.codeObjImpls[variant.impl];
  const core = getCodeObjCore(p, codeObjId);

  if (!impl || !core) {
    throw new Error(`Missing section data for sectionId: ${sectionId}`);
  }

  return { impl, core, variant };
}

export function getSectionCore(p: ZustandProjectState, sectionId: string) {
  const section = p.sections[sectionId];
  if (!section) {
    throw new Error();
  }
  return section;
}

export function getBaseSectionImpl(p: ZustandProjectState, implId: string) {
  const impl = p.sectionImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getSectionVariant(
  p: ZustandProjectState,
  variantId: string,
) {
  const variant = p.sectionVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getCodeObjCore(p: ZustandProjectState, codeObjId: string) {
  const codeObj = p.codeObjs[codeObjId];
  if (!codeObj) {
    throw new Error();
  }
  return codeObj;
}

export function getBaseCodeObjImpl(p: ZustandProjectState, implId: string) {
  const impl = p.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getCodeObjVariant(
  p: ZustandProjectState,
  variantId: string,
) {
  const variant = p.codeObjVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
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
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  useProjectState.setState(projectState);
  useNodeInternals.setState((state) => ({
    x: createNodesMapFromProjectConfigChildren(
      useProjectState.getState(),
      state.x,
    ),
  }));
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
  nodes: ZustandNodeInternalsState["x"],
) {
  const nodesMap: Map<string, Node> = new Map();

  for (const [k, v] of Object.entries(p.projectConfig.topLevelSections)) {
    nodesMap.set(k, {
      id: k,
      position: { x: v.x, y: v.y },
      width: nodes.get(k)?.width ?? v.w,
      height: nodes.get(k)?.height ?? v.h,
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
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

export function createTopLevelSectionLayoutDict(
  sections: ProjectStateSingleConfig["sections"],
  nodeInternals: ZustandNodeInternalsState["x"],
) {
  const topLevelSections: ProjectStateSingleConfig["projectConfig"]["topLevelSections"] =
    {};
  for (const c of nodeInternals.values()) {
    if (c.id in sections) {
      // need this filter because some sections might be temporary
      topLevelSections[c.id] = {
        x: c.position.x,
        y: c.position.y,
        zIndex: c.zIndex,
        w: c.width, // save width and height so we can show preview on home page
        h: c.height,
      };
    }
  }
  return topLevelSections;
}

export const debounced_route_update_from_frontend_top_level_section_layout =
  _.debounce(route_update_from_frontend_top_level_section_layout, 500);
