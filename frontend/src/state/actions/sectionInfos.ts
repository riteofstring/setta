import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import { unstable_batchedUpdates } from "react-dom";
import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "state/actions/renameRefactors";
import {
  PendingOperation,
  useAllProjectMetadata,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  useShareSession,
  useToolArgumentPreview,
  ZustandNodeInternalsState,
  ZustandProjectState,
} from "state/definitions";
import type { ResponseDataAndStatus } from "utils/endpointUtils";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_sections,
  route_group_sections,
  route_set_top_level_section_layout,
  route_set_viewport,
  route_toggle_param_selected,
  route_ungroup_groups,
  route_unselect_all_params,
} from "utils/generatedEndpoints";
import {
  AllProjectMetadata,
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  ImplArgsBundleMap,
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ProjectStateSingleConfig,
  ProjectStateSingleConfigWithCompletedOpIds,
  SectionType,
  SectionTypeEnum,
  Variant,
  Viewport,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { applyActiveSectionChange } from "./activeSectionController";

function getEffectiveImpl<T>(impl: T, core: Core, variant: Variant): T {
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...core.sharedModifier, ...variant.modifier });
  return effective;
}

function getEffectiveSectionImplIfPresent(
  projectState: ZustandProjectState,
  sectionId: string,
): BaseSectionImplUnion | null {
  const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return null;
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = projectState.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = projectState.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(impl, core, variant);
}

function getEffectiveCodeObjImplIfPresent(
  projectState: ZustandProjectState,
  sectionImpl: BaseSectionImplUnion,
  codeObjId: string,
): BaseCodeObjImplUnion | null {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    if (sectionImpl.type !== SectionTypeEnum.MetaControl) {
      return null;
    }
    if (!sectionImpl.metaControlParamId) {
      return null;
    }
    if (sectionImpl.metaControlParamId !== codeObjId) {
      return null;
    }
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      return null;
    }
    const variant = projectState.codeObjVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = projectState.codeObjImpls[variant.impl];
    if (!impl) {
      return null;
    }
    const core = projectState.codeObjs[codeObjId];
    if (!core) {
      return null;
    }
    return getEffectiveImpl(impl, core, variant);
  }
  const variantId = sectionImpl.codeObjVariantMap[codeObjId];
  if (variantId === undefined) {
    return null;
  }
  const variant = projectState.codeObjVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = projectState.codeObjImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = projectState.codeObjs[codeObjId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(impl, core, variant);
}

export function getCurrSectionVariantId(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = preview
    ? p.previewSectionVariantMap[sectionId] ??
      p.projectConfig.sectionVariantMap[sectionId]
    : p.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    throw new Error();
  }
  return variantId;
}

export function getCurrSectionVariant(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = getCurrSectionVariantId(p, sectionId, preview);
  return getSectionVariant(p, variantId);
}

export function getCurrEffectiveSectionImpl(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variant = getCurrSectionVariant(p, sectionId, preview);
  const baseImpl = getSectionImpl(p, variant.impl);
  const core = getSectionCore(p, sectionId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveSectionImplWithTypeGuard<T>(
  p: ZustandProjectState,
  sectionId: string,
  typeGuard: (impl) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveSectionImpl(p, sectionId, preview);

  if (!typeGuard(effective)) {
    throw new Error(
      `Section implementation failed type guard for section ${sectionId}`,
    );
  }

  return effective;
}

export function getCurrEffectiveSectionImplOfType<T extends SectionType>(
  p: ZustandProjectState,
  sectionId: string,
  expectedType: T,
  preview = false,
): Extract<BaseSectionImplUnion, { type: T }> {
  const impl = getCurrEffectiveSectionImpl(p, sectionId, preview);

  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }

  return impl as Extract<BaseSectionImplUnion, { type: T }>;
}

export function getVariantBaseAndEffectiveSectionImpl(
  p: ZustandProjectState,
  core: Core,
  variantId: string,
) {
  const variant = getSectionVariant(p, variantId);
  const baseImpl = getSectionImpl(p, variant.impl);
  const impl = getEffectiveImpl(baseImpl, core, variant);
  return { variant, baseImpl, impl };
}

export function getCurrCodeObjVariant(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const sectionImpl = getCurrEffectiveSectionImpl(p, sectionId, preview);
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      throw new Error();
    }
    return getCodeObjVariant(p, variantId);
  }
  if (sectionImpl.type === SectionTypeEnum.MetaControl) {
    const controlParamId = sectionImpl.metaControlParamId;
    if (!controlParamId) {
      throw new Error();
    }
    if (controlParamId !== codeObjId) {
      throw new Error();
    }
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      throw new Error();
    }
    return getCodeObjVariant(p, variantId);
  }
  throw new Error();
}

export function getCurrEffectiveCodeObjImpl(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const variant = getCurrCodeObjVariant(p, sectionId, codeObjId, preview);
  const baseImpl = getCodeObjImpl(p, variant.impl);
  const core = getCodeObjCore(p, codeObjId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveCodeObjImplWithTypeGuard<T>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveCodeObjImpl(
    p,
    sectionId,
    codeObjId,
    preview,
  );

  if (!typeGuard(effective)) {
    throw new Error(
      `Code obj implementation failed type guard for section ${sectionId}, codeObj ${codeObjId}`,
    );
  }

  return effective;
}

export function getCurrEffectiveCodeObjImplOfType<T extends CodeObjType>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  expectedType: T,
): Extract<BaseCodeObjImplUnion, { type: T }> {
  const impl = getCurrEffectiveCodeObjImpl(p, sectionId, codeObjId);

  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }

  return impl as Extract<BaseCodeObjImplUnion, { type: T }>;
}

function getEffectiveImplFromVariantMap(
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

function setEffectiveImplValue<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  variant: Variant,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const curr = getEffectiveImpl(impl, core, variant);
  for (const [k, v] of Object.entries(args)) {
    const currV = curr[k];
    if (!core.unsharedKeys.includes(k)) {
      core.sharedModifier[k] = typeof v === "function" ? v(currV) : v;
    } else if (!impl.isPreset) {
      impl[k] = typeof v === "function" ? v(currV) : v;
    } else {
      variant.modifier[k] = typeof v === "function" ? v(currV) : v;
    }
  }
  return getEffectiveImpl(impl, core, variant);
}

export function setCurrEffectiveSectionImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setSectionVariantImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getSectionVariant(state, variantId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setCurrEffectiveCodeObjImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrCodeObjVariant(state, sectionId, codeObjId);
  const impl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function getSectionCore(p: ZustandProjectState, sectionId: string) {
  const section = p.sections[sectionId];
  if (!section) {
    throw new Error();
  }
  return section;
}

function getSectionImpl(p: ZustandProjectState, implId: string) {
  const impl = p.sectionImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getSectionVariant(p: ZustandProjectState, variantId: string) {
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

export function getParamDisplayName(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
) {
  const codeObj = getCodeObjCore(state, codeObjId);
  if (!state.projectConfig.showParamDisplayNames) {
    return codeObj.name;
  }
  const impl = getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId);
  if (isBaseParamCodeObjImpl(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}

export function getCodeObjImpl(p: ZustandProjectState, implId: string) {
  const impl = p.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

function getCodeObjVariant(p: ZustandProjectState, variantId: string) {
  const variant = p.codeObjVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getCurrShownParamIds(
  p: ZustandProjectState,
  sectionId: string,
  isPinned: boolean,
  preview = false,
) {
  const variantId = getCurrSectionVariantId(p, sectionId, preview);
  const shown = p.shownParamIds[variantId];
  if (!shown) {
    throw new Error();
  }
  return isPinned ? shown.pinned : shown.unpinned;
}

export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
}

export function getSectionIsHorizontalOrientation(sectionId: string): boolean {
  const state = useProjectState.getState();
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  if (impl.type !== SectionTypeEnum.Group) {
    return false;
  }
  const core = getSectionCore(state, sectionId);
  if (
    Object.prototype.hasOwnProperty.call(
      variant.modifier,
      "isHorizontalOrientation",
    )
  ) {
    return Boolean(variant.modifier.isHorizontalOrientation);
  }
  if (
    Object.prototype.hasOwnProperty.call(
      core.sharedModifier,
      "isHorizontalOrientation",
    )
  ) {
    return Boolean(core.sharedModifier.isHorizontalOrientation);
  }
  return impl.isHorizontalOrientation;
}

export function getSectionType(state: ZustandProjectState, sectionId: string) {
  return getCurrEffectiveSectionImpl(state, sectionId).type;
}

export function getHighestAncestor(
  sectionId: string,
  parentIdGetter: (id: string) => string | null = (id) =>
    useProjectState.getState().parentSectionMap[id] ?? null,
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
      const impl = getCurrEffectiveSectionImpl(state, currId);
      if (isBaseParentSectionImpl(impl)) {
        ids.push(...impl.children);
      }
    }
    idx += 1;
  }
  return ids;
}

export function manualDndChildrenReset() {
  updateDndChildren(
    getDisplayedSectionIdToChildren(useProjectState.getState()),
  );
}

export function processProjectStateUpdateFromBackend(
  x: ProjectStateSingleConfigWithCompletedOpIds,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (x.projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  const backendPendingIds = new Set(x.pendingOpIds);
  const completedIds = new Set(x.completedOpIds);
  const currentPending = usePendingOperations.getState().pending;
  const nextPending = currentPending.reduce<PendingOperation[]>(
    (acc, opInfo) => {
      if (completedIds.has(opInfo.opId)) {
        return acc;
      }
      const isBackendPending = backendPendingIds.has(opInfo.opId);
      if (opInfo.acknowledged && !isBackendPending) {
        return acc;
      }
      const acknowledged = opInfo.acknowledged || isBackendPending;
      acc.push({
        ...opInfo,
        acknowledged,
      });
      return acc;
    },
    [],
  );
  for (const opInfo of nextPending) {
    opInfo.apply(x.projectState);
  }
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    x.projectState,
    useNodeInternals.getState().x,
  );
  unstable_batchedUpdates(() => {
    usePendingOperations.setState({ pending: nextPending });
    useNodeInternals.setState({ x: nextNodesMap });
    useProjectState.setState(() => x.projectState);
  });

  markRenameBroadcastsReady(completedIds);
  maybeOpenNextRenamePrompt();
  clearToolArgumentPreviewForProjectState(
    projectConfigId,
    useProjectState.getState(),
  );
}

function clearToolArgumentPreviewForProjectState(
  projectConfigId: string,
  projectState: ZustandProjectState,
) {
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Code) {
        delete previewState.previewCodeBySectionId[sectionId];
        continue;
      }
      if (sectionImpl.code === entry.value) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCallableNameBySectionId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
        delete previewState.previewCallableNameBySectionId[sectionId];
        continue;
      }
      const { callable } = sectionImpl;
      let canonicalName = "";
      if (callable) {
        const codeObj = projectState.codeObjs[callable];
        if (!codeObj) {
          delete previewState.previewCallableNameBySectionId[sectionId];
          continue;
        }
        canonicalName = codeObj.name;
      }
      if (canonicalName === entry.value) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
    for (const [sectionId, paramEntries] of Object.entries(
      previewState.previewParamValueBySectionAndParamId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
        continue;
      }
      for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
        const impl = getEffectiveCodeObjImplIfPresent(
          projectState,
          sectionImpl,
          paramInfoId,
        );
        if (!impl || !isBaseChildlessCodeObjImpl(impl)) {
          delete paramEntries[paramInfoId];
          continue;
        }
        if (impl.value === entry.value) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

function updateProjectState({
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

export function setSectionChildren(
  state: ZustandProjectState,
  sectionId: string,
  newStateFn: (currChildren: Array<string>) => Array<string>,
) {
  setCurrEffectiveSectionImplValue<"BaseParentSection">(state, sectionId, {
    children: newStateFn,
  });
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
      const childImpl = getCurrEffectiveSectionImpl(state, childId);
      getDisplayedSectionIdToChildrenHelper(childId, childImpl, state, output);
    }
  } else {
    output[sectionId] = [];
  }
}

export function getDisplayedSectionIdToChildren(state: ZustandProjectState) {
  const output: Record<string, Array<string>> = {};
  for (const sectionId of Object.keys(state.projectConfig.topLevelSections)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
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

function getCodeChildrenAndParentCodeInfoId(
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

export function getSectionShouldRender(
  visibility: boolean,
  isEditingViewMode: boolean,
) {
  return isEditingViewMode || visibility;
}

export function getActiveViewModeConfig(state: ZustandProjectState) {
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (!activeViewModeId) {
    throw new Error("Active view mode is not set");
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    throw new Error(`Active view mode ${activeViewModeId} not found`);
  }
  return viewMode;
}

function getSectionVisibilityForActiveViewMode(
  sectionId: string,
  state: ZustandProjectState,
) {
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
    );
  }
  return {
    visibility,
    viewMode,
  };
}

export function getSectionViewModeVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { isEditingViewMode } = state.projectConfig;
  const { visibility } = getSectionVisibilityForActiveViewMode(
    sectionId,
    state,
  );
  return {
    visibility,
    isEditingViewMode,
  };
}

export function getAncestorSameVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { visibilityBySectionId, id: viewModeId } =
    getActiveViewModeConfig(state);
  let impl = getCurrEffectiveSectionImpl(state, sectionId);
  let { parentId } = impl;
  const targetVisibility = visibilityBySectionId[sectionId];
  if (targetVisibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewModeId}`,
    );
  }

  while (parentId) {
    impl = getCurrEffectiveSectionImpl(state, parentId);
    const parentVisibility = visibilityBySectionId[parentId];
    if (parentVisibility === undefined) {
      throw new Error(
        `Missing visibility for section ${parentId} in view mode ${viewModeId}`,
      );
    }
    if (parentVisibility === targetVisibility) {
      return true;
    }

    ({ parentId } = impl);
  }

  return false;
}

export function deleteAllActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isShareMode) {
    return;
  }
  route_delete_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds: useProjectState.getState().projectConfig.activeIds,
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

export const debounced_route_set_top_level_section_layout = _.debounce(() => {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isShareMode &&
    shareSession.sharePolicy?.allowLayoutChanges === false
  ) {
    return;
  }
  route_set_top_level_section_layout({
    projectConfigId: getCurrProjectConfigId(),
    topLevelSections: createTopLevelSectionLayoutDict(
      useProjectState.getState().sections,
      useNodeInternals.getState().x,
    ),
  });
}, 500);

export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}

function getCurrProjectConfigViewport() {
  return useReactFlow.getState().fitViewOnInit ? null : getViewport();
}

export function getSectionChildren(
  state: ZustandProjectState,
  parentId: string,
) {
  return getCurrEffectiveSectionImplWithTypeGuard(
    state,
    parentId,
    isBaseParentSectionImpl,
  ).children;
}

export async function groupActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isShareMode) {
    return;
  }
  const sectionIds = useProjectState.getState().projectConfig.activeIds;
  route_group_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds,
  });
  useReactFlow.setState({ nodesSelectionDims: null });
}

export async function ungroupActiveGroups() {
  const shareSession = useShareSession.getState();
  if (shareSession.isShareMode) {
    return;
  }
  const groupIds = useProjectState.getState().projectConfig.activeIds;
  route_ungroup_groups({ projectConfigId: getCurrProjectConfigId(), groupIds });
}

function addPendingOp(apply: (x: ZustandProjectState) => void) {
  const opId = createNewId();
  usePendingOperations.setState((state) => ({
    pending: [...state.pending, { apply, opId, acknowledged: false }],
  }));
  return opId;
}

function acknowledgePendingOp(opId: string) {
  // Mark as acknowledged so stale optimistic ops don't override later backend syncs.
  usePendingOperations.setState((state) => {
    const index = state.pending.findIndex((opInfo) => opInfo.opId === opId);
    if (index < 0 || state.pending[index].acknowledged) {
      return state;
    }
    const nextPending = [...state.pending];
    nextPending[index] = {
      ...nextPending[index],
      acknowledged: true,
    };
    return { pending: nextPending };
  });
}

function isResponseDataAndStatus(
  value: unknown,
): value is ResponseDataAndStatus<unknown> {
  // Narrow unknown send results without relying on try/catch for control flow.
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "hasResponse" in value
  );
}

export function dispatchOptimisticProjectStateUpdate({
  apply,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => void | Promise<unknown>;
}) {
  useProjectState.setState(apply);
  const opId = addPendingOp(apply);
  const result = send(opId);
  if (result instanceof Promise) {
    void result.then((res) => {
      // A 200 response means the backend accepted the op; don't keep reapplying it.
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingOp(opId);
      }
    });
  }
  return opId;
}

export function toggleParamSelected(sectionId: string, paramInfoId: string) {
  const currentState = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    currentState,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const wasSelected = impl.selectedParams.includes(paramInfoId);
  const nextSelectedCount = wasSelected
    ? impl.selectedParams.length - 1
    : impl.selectedParams.length + 1;
  const hasSelectedParams = nextSelectedCount > 0;

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          selectedParams: (curr) => {
            if (curr?.includes(paramInfoId)) {
              return curr.filter((id) => id !== paramInfoId);
            }
            return [...(curr ?? []), paramInfoId];
          },
        },
      );
    },
    send: (frontendOpId) =>
      route_toggle_param_selected({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramInfoId,
        frontendOpId,
      }),
  });

  applyActiveSectionChange({
    interaction: wasSelected ? "param-unselect" : "param-select",
    sectionId,
    hasSelectedParams,
  });
}

export function unselectAllParams() {
  const currentState = useProjectState.getState();
  const sectionIds = Object.keys(currentState.sections);
  const hasSelectedParams = sectionIds.some((sectionId) => {
    const impl = getCurrEffectiveSectionImpl(currentState, sectionId);
    return (
      isBaseSectionWithParamsImpl(impl) &&
      (impl.selectedParams?.length ?? 0) > 0
    );
  });

  if (!hasSelectedParams) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const sectionId of Object.keys(state.sections)) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (
          isBaseSectionWithParamsImpl(impl) &&
          impl.selectedParams.length > 0
        ) {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { selectedParams: [] },
          );
        }
      }
    },
    send: (frontendOpId) =>
      route_unselect_all_params({
        projectConfigId: getCurrProjectConfigId(),
        frontendOpId,
      }),
  });

  return true;
}

export function updateAllProjectMetadata(x: AllProjectMetadata) {
  useAllProjectMetadata.setState(x);
}

function dispatchViewportUpdate(viewport: Viewport | null) {
  if (_.isEqual(useProjectState.getState().projectConfig.viewport, viewport)) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectConfig.viewport = viewport;
    },
    send: (frontendOpId) =>
      route_set_viewport({
        projectConfigId: getCurrProjectConfigId(),
        viewport,
        frontendOpId,
      }),
  });
}

export const debouncedDispatchViewportUpdate = _.debounce(
  () => dispatchViewportUpdate(getCurrProjectConfigViewport()),
  1000,
);
