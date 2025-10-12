import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import {
  useAllProjectMetadata,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  PendingOperation,
  ZustandNodeInternalsState,
  ZustandProjectState,
} from "state/definitions";
import {
  route_delete_sections,
  route_group_sections,
  route_set_top_level_section_layout,
  route_set_viewport,
  route_ungroup_groups,
  route_toggle_param_selected,
  route_unselect_all_params,
} from "utils/generatedEndpoints";
import {
  AllProjectMetadata,
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  ImplArgsBundleMap,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ProjectStateSingleConfig,
  ProjectStateSingleConfigWithCompletedOpIds,
  SectionType,
  Variant,
  ViewingEditingMode,
  ViewingEditingModeEnum,
  Viewport,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export function getEffectiveImpl<T>(impl: T, core: Core, variant: Variant): T {
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...core.sharedModifier, ...variant.modifier });
  return effective;
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
  // Check if sectionId exists in the map
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    p,
    sectionId,
    isBaseSectionWithParamsImpl,
    preview,
  );
  const variantId = sectionImpl.codeObjVariantMap[codeObjId];
  if (variantId === undefined) {
    throw new Error();
  }
  return getCodeObjVariant(p, variantId);
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

export function getSectionImpl(p: ZustandProjectState, implId: string) {
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

export function getCodeObjImpl(p: ZustandProjectState, implId: string) {
  const impl = p.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getCodeObjVariant(p: ZustandProjectState, variantId: string) {
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
      const acknowledged = opInfo.acknowledged || isBackendPending;
      if (opInfo.acknowledged && !isBackendPending) {
        return acc;
      }
      acc.push({
        ...opInfo,
        acknowledged,
      });
      return acc;
    },
    [],
  );
  usePendingOperations.setState({ pending: nextPending });
  useProjectState.setState(() => {
    for (const opInfo of nextPending) {
      opInfo.apply(x.projectState);
    }
    return x.projectState;
  });
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
  const sectionImpl = getCurrEffectiveSectionImpl(state, sectionId);
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
  let impl = getCurrEffectiveSectionImpl(state, sectionId);
  let { parentId } = impl;
  const key = getSectionVisibilityKey(viewingEditingMode);
  const targetVisibility = impl.visibility[key];

  while (parentId) {
    impl = getCurrEffectiveSectionImpl(state, parentId);
    if (impl.visibility[key] === targetVisibility) {
      return true;
    }

    ({ parentId } = impl);
  }

  return false;
}

export function deleteAllActiveSections() {
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

export const debounced_route_set_top_level_section_layout = _.debounce(
  () =>
    route_set_top_level_section_layout({
      projectConfigId: getCurrProjectConfigId(),
      topLevelSections: createTopLevelSectionLayoutDict(
        useProjectState.getState().sections,
        useNodeInternals.getState().x,
      ),
    }),
  500,
);

export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}

export function getCurrProjectConfigViewport() {
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
  const sectionIds = useProjectState.getState().projectConfig.activeIds;
  route_group_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds,
  });
  useReactFlow.setState({ nodesSelectionDims: null });
}

export async function ungroupActiveGroups() {
  const groupIds = useProjectState.getState().projectConfig.activeIds;
  route_ungroup_groups({ projectConfigId: getCurrProjectConfigId(), groupIds });
}

export function addPendingOp(apply: (x: ZustandProjectState) => void) {
  const opId = createNewId();
  usePendingOperations.setState((state) => ({
    pending: [...state.pending, { apply, opId, acknowledged: false }],
  }));
  return opId;
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
  void send(opId);
  return opId;
}

export function toggleParamSelected(sectionId: string, paramInfoId: string) {
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
}

export function unselectAllParams() {
  const currentState = useProjectState.getState();
  const sectionIds = Object.keys(currentState.sections);
  const hasSelectedParams = sectionIds.some((sectionId) => {
    const impl = getCurrEffectiveSectionImpl(currentState, sectionId);
    return (
      isBaseSectionWithParamsImpl(impl) && (impl.selectedParams?.length ?? 0) > 0
    );
  });

  if (!hasSelectedParams) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const sectionId of Object.keys(state.sections)) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0) {
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
