import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";

import type { Node } from "gpuFlow/flowTypes";

import {
  requestInitialFitView,
  setViewport as setGpuViewport,
  setInitialFitViewDone,
} from "gpuFlow/viewportActions";

import _ from "lodash";

import {
  deleteSections,
  type GetLatestProjectStateResponse,
} from "openapi/http";

import { unstable_batchedUpdates } from "react-dom";

import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "state/actions/renameRefactors";

import {
  getActiveSectionUIIds,
  getReconciledActiveSectionUIStateFromBackend,
  sanitizeProjectStateActiveIds,
  useActiveSectionUI,
} from "state/activeSectionUI";

import {
  PendingOperation,
  ZustandNodeInternalsState,
  ZustandProjectState,
  runWithAtomicallyPublishedProjectStores,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  useShareSession,
  useToolArgumentPreview,
  type ToolArgumentPreviewProjectState,
} from "state/definitions";

import {
  BaseSectionImplUnion,
  ListRootViewModeEnum,
  SectionTypeEnum,
  SingleConfig,
  isBaseChildlessCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

import { recordAuthoritativeProjectChatWindowingState } from "../projectChatWindowingAuthoritative";

import { reconcileProjectChatWindowingEphemeralState } from "../projectChatWindowingEphemeral";

import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariant,
  getCurrSectionVariantId,
  getEffectiveCodeObjImplIfPresent,
  getEffectiveSectionImplIfPresent,
  getSectionCore,
  getSectionImpl,
  getTopLevelSectionIdsForDisplay,
  mergeStreamingChatSections,
  setCurrEffectiveSectionImplValue,
} from "./projectStateCore";

import { createProjectStateUpdateChromeReproTimer } from "./projectStateChromeReproPerf";

import {
  buildTopLevelSectionNode,
  getPositiveTopLevelLayoutDimension,
} from "./topLevelSectionNode";
import {
  getCurrProjectConfigId,
  reconcilePendingTopLevelLayout,
  reconcilePendingViewport,
} from "./viewportUpdates";

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

export function updateShownParamIdsForPinnedParams(
  state: ZustandProjectState,
  sectionId: string,
  nextPinnedParams: Array<string>,
  preview = true,
) {
  const variantId = getCurrSectionVariantId(state, sectionId, preview);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    return;
  }
  const nextPinnedSet = new Set(nextPinnedParams);
  const nextPinnedTopLevel = partitionParamIdsByPinnedState(
    shown.pinned.topLevelParamIds,
    nextPinnedSet,
  );
  const nextUnpinnedTopLevel = partitionParamIdsByPinnedState(
    shown.unpinned.topLevelParamIds,
    nextPinnedSet,
  );
  const nextPinnedRequired = partitionParamPathsByPinnedState(
    shown.pinned.requiredParamIdsToPaths,
    nextPinnedSet,
  );
  const nextUnpinnedRequired = partitionParamPathsByPinnedState(
    shown.unpinned.requiredParamIdsToPaths,
    nextPinnedSet,
  );
  state.shownParamIds[variantId] = {
    pinned: {
      ...shown.pinned,
      topLevelParamIds: [
        ...nextPinnedTopLevel.pinned,
        ...nextUnpinnedTopLevel.pinned,
      ],
      requiredParamIdsToPaths: {
        ...nextPinnedRequired.pinned,
        ...nextUnpinnedRequired.pinned,
      },
    },
    unpinned: {
      ...shown.unpinned,
      topLevelParamIds: [
        ...nextPinnedTopLevel.unpinned,
        ...nextUnpinnedTopLevel.unpinned,
      ],
      requiredParamIdsToPaths: {
        ...nextPinnedRequired.unpinned,
        ...nextUnpinnedRequired.unpinned,
      },
    },
  };
}

function partitionParamIdsByPinnedState(
  paramIds: string[],
  nextPinnedSet: Set<string>,
): {
  pinned: string[];
  unpinned: string[];
} {
  const partitioned = {
    pinned: [] as string[],
    unpinned: [] as string[],
  };
  for (const paramId of paramIds) {
    const key = nextPinnedSet.has(paramId) ? "pinned" : "unpinned";
    partitioned[key].push(paramId);
  }
  return partitioned;
}

function partitionParamPathsByPinnedState(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  nextPinnedSet: Set<string>,
): {
  pinned: Record<string, Array<string>>;
  unpinned: Record<string, Array<string>>;
} {
  const partitioned = {
    pinned: {} as Record<string, Array<string>>,
    unpinned: {} as Record<string, Array<string>>,
  };
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    const key = nextPinnedSet.has(paramId) ? "pinned" : "unpinned";
    partitioned[key][paramId] = path;
  }
  return partitioned;
}

export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
}

export function getSectionIsHorizontalOrientation(sectionId: string): boolean {
  const state = useProjectState.getState();
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  if (impl.type === SectionTypeEnum.ListRoot) {
    return impl.viewMode === ListRootViewModeEnum.kanban;
  }
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

export function getSectionImplChildren(
  sectionImpl: BaseSectionImplUnion,
): Array<string> {
  if (!isBaseParentSectionImpl(sectionImpl)) {
    return [];
  }
  return [...sectionImpl.children];
}

function getComparableProjectState(
  state: SingleConfig | ZustandProjectState,
): SingleConfig {
  return sanitizeProjectStateActiveIds({
    sections: state.sections,
    sectionImpls: state.sectionImpls,
    sectionVariants: state.sectionVariants,
    codeObjs: state.codeObjs,
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    artifactGroups: state.artifactGroups,
    pluginData: state.pluginData,
    projectConfig: state.projectConfig,
    sectionCapabilities: state.sectionCapabilities,
    singletonSections: state.singletonSections,
    parentSectionMap: state.parentSectionMap,
    shownParamIds: state.shownParamIds,
    requiredDecodedImages: state.requiredDecodedImages,
    genCodeBinding: state.genCodeBinding ?? null,
    projectChatWindowing: state.projectChatWindowing,
  });
}

function pruneProjectChatWindowingForExistingSections(
  projectState: SingleConfig,
): SingleConfig {
  const existingSectionIds = new Set(Object.keys(projectState.sections));
  let changed = false;
  const nextInstancesById = Object.fromEntries(
    Object.entries(projectState.projectChatWindowing.instancesById).filter(
      ([, instance]) => {
        const sectionId = instance.sectionIdOrNull;
        if (!sectionId || existingSectionIds.has(sectionId)) {
          return true;
        }
        changed = true;
        return false;
      },
    ),
  );
  if (!changed) {
    return projectState;
  }
  const nextOrder = projectState.projectChatWindowing.order.filter(
    (instanceId) => instanceId in nextInstancesById,
  );
  return {
    ...projectState,
    projectChatWindowing: {
      ...projectState.projectChatWindowing,
      instancesById: nextInstancesById,
      order: nextOrder,
    },
  };
}

export function processProjectStateUpdateFromBackend(
  x: GetLatestProjectStateResponse,
) {
  const projectConfigId = getCurrProjectConfigId();
  const timer = createProjectStateUpdateChromeReproTimer(x);
  if (x.projectState.projectConfig.id !== projectConfigId) {
    timer.finish({ ignored: true, reason: "project-config-mismatch" });
    return;
  }
  const currentState = useProjectState.getState();
  mergeStreamingChatSections(x.projectState, currentState);
  x.projectState = pruneProjectChatWindowingForExistingSections(x.projectState);
  recordAuthoritativeProjectChatWindowingState(
    x.projectState.projectConfig.id,
    x.projectState.projectChatWindowing,
  );
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
      acc.push({
        ...opInfo,
        acknowledged,
      });
      return acc;
    },
    [],
  );
  reconcilePendingViewport(nextPending);
  reconcilePendingTopLevelLayout(nextPending);
  for (const opInfo of nextPending) {
    opInfo.apply(x.projectState);
  }
  timer.mark("reconcile-pending-ops");
  const nextActiveSectionUIState = getReconciledActiveSectionUIStateFromBackend(
    x.projectState.projectConfig.activeIds,
    x.completedOpIds,
    x.projectState.projectConfig.id,
    Object.keys(x.projectState.sections),
  );
  const sanitizedProjectState = getComparableProjectState(x.projectState);
  const comparableCurrentState = getComparableProjectState(currentState);
  timer.mark("build-comparable-project-state");
  const projectStateChanged = !_.isEqual(
    comparableCurrentState,
    sanitizedProjectState,
  );
  timer.mark("compare-project-state");
  if (!projectStateChanged) {
    unstable_batchedUpdates(() => {
      usePendingOperations.setState({ pending: nextPending });
      if (nextActiveSectionUIState !== null) {
        useActiveSectionUI.setState(nextActiveSectionUIState);
      }
    });
    markRenameBroadcastsReady(completedIds);
    maybeOpenNextRenamePrompt();
    clearToolArgumentPreviewForProjectState(projectConfigId, currentState);
    timer.finish({ changed: false });
    return;
  }
  const shouldRequestFitView = applyViewportFromProjectState(x.projectState);
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    x.projectState,
    useNodeInternals.getState().x,
  );
  reconcileProjectChatWindowingEphemeralState(
    sanitizedProjectState.projectChatWindowing,
    sanitizedProjectState.projectConfig.id,
  );
  runWithAtomicallyPublishedProjectStores(
    {
      projectState: sanitizedProjectState,
      nodeInternals: { x: nextNodesMap },
      activeSectionUI: nextActiveSectionUIState,
    },
    () => {
      unstable_batchedUpdates(() => {
        usePendingOperations.setState({ pending: nextPending });
        useNodeInternals.setState({ x: nextNodesMap });
        useProjectState.setState(() => sanitizedProjectState);
        if (nextActiveSectionUIState !== null) {
          useActiveSectionUI.setState(nextActiveSectionUIState);
        }
      });
    },
  );
  timer.mark("publish-project-stores");
  if (shouldRequestFitView) {
    useMisc.setState({ requestUpdateNodeDimensions: true });
  }
  markRenameBroadcastsReady(completedIds);
  maybeOpenNextRenamePrompt();
  clearToolArgumentPreviewForProjectState(
    projectConfigId,
    useProjectState.getState(),
  );
  timer.finish({
    changed: true,
    nextNodeCount: nextNodesMap.size,
    shouldRequestFitView,
  });
}

function applyViewportFromProjectState(projectState: SingleConfig): boolean {
  const { viewport, viewportInitialized } = projectState.projectConfig;
  const currentState = useProjectState.getState();
  const currentConfig = currentState.projectConfig;
  const viewModeChanged =
    currentConfig.activeViewModeId !==
    projectState.projectConfig.activeViewModeId;
  const viewportChanged =
    !_.isEqual(currentConfig.viewport, viewport) ||
    currentConfig.viewportInitialized !== viewportInitialized;
  const visibleTopLevelSectionIdsChanged = !_.isEqual(
    getVisibleTopLevelSectionIdsForAutoFit(currentState),
    getVisibleTopLevelSectionIdsForAutoFit(projectState),
  );
  if (
    !viewportChanged &&
    !viewModeChanged &&
    (!(!viewport || !viewportInitialized) || !visibleTopLevelSectionIdsChanged)
  ) {
    return false;
  }
  if (!viewport || !viewportInitialized) {
    requestInitialFitView(getFitViewOptionsForVisibleSections(projectState));
    return true;
  }
  setGpuViewport(viewport);
  setInitialFitViewDone();
  return false;
}

function getVisibleTopLevelSectionIdsForAutoFit(
  projectState: SingleConfig,
): string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const orderedSectionIds = Object.keys(topLevelSections);
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode || !activeViewModeId) {
    return orderedSectionIds;
  }
  const activeViewMode = viewModes[activeViewModeId];
  if (!activeViewMode) {
    return orderedSectionIds;
  }
  return orderedSectionIds.filter(
    (sectionId) => activeViewMode.visibilityBySectionId[sectionId],
  );
}

function getFitViewOptionsForVisibleSections(projectState: SingleConfig) {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode) {
    return undefined;
  }
  if (!activeViewModeId) {
    return undefined;
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return undefined;
  }
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const visibleNodeIds = Object.keys(topLevelSections).filter(
    (sectionId) => viewMode.visibilityBySectionId[sectionId],
  );
  if (visibleNodeIds.length === 0) {
    return undefined;
  }
  return {
    nodes: visibleNodeIds.map((id) => ({ id }) as Node),
  };
}

function prunePreviewCodeEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
  for (const [sectionId, entry] of Object.entries(
    previewState.previewCodeBySectionId,
  )) {
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (
      !sectionImpl ||
      sectionImpl.type !== SectionTypeEnum.Code ||
      sectionImpl.code === entry.value
    ) {
      delete previewState.previewCodeBySectionId[sectionId];
    }
  }
}

function getCanonicalCallableName(
  projectState: ZustandProjectState,
  sectionImpl: Extract<BaseSectionImplUnion, { callable?: string | null }>,
): string | null {
  if (!sectionImpl.callable) {
    return "";
  }
  const codeObj = projectState.codeObjs[sectionImpl.callable];
  return codeObj ? codeObj.name : null;
}

function prunePreviewCallableNameEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
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
    const canonicalName = getCanonicalCallableName(projectState, sectionImpl);
    if (canonicalName === null || canonicalName === entry.value) {
      delete previewState.previewCallableNameBySectionId[sectionId];
    }
  }
}

function prunePreviewParamValueEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
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
      if (
        !impl ||
        !isBaseChildlessCodeObjImpl(impl) ||
        impl.value === entry.value
      ) {
        delete paramEntries[paramInfoId];
      }
    }
    if (Object.keys(paramEntries).length === 0) {
      delete previewState.previewParamValueBySectionAndParamId[sectionId];
    }
  }
}

function isToolArgumentPreviewEmpty(
  previewState: ToolArgumentPreviewProjectState,
): boolean {
  return (
    Object.keys(previewState.previewCodeBySectionId).length === 0 &&
    Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
    Object.keys(previewState.previewParamValueBySectionAndParamId).length === 0
  );
}

export function clearToolArgumentPreviewForProjectState(
  projectConfigId: string,
  projectState: ZustandProjectState,
) {
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    prunePreviewCodeEntries(previewState, projectState);
    prunePreviewCallableNameEntries(previewState, projectState);
    prunePreviewParamValueEntries(previewState, projectState);
    if (isToolArgumentPreviewEmpty(previewState)) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

type TopLevelSectionLayout =
  SingleConfig["projectConfig"]["topLevelSections"][string];

export function shouldRenderTopLevelSectionNode(
  state: ZustandProjectState,
  sectionId: string,
  canFilterByView: boolean,
): boolean {
  if (!canFilterByView) {
    return true;
  }
  const visibilityInfo = getSectionViewModeVisibilityIfPresent(
    sectionId,
    state,
  );
  return visibilityInfo
    ? getSectionShouldRender(
        visibilityInfo.visibility,
        visibilityInfo.isEditingViewMode,
      )
    : false;
}

export function createNodesMapFromProjectConfigChildren(
  p: ZustandProjectState,
  nodes: ZustandNodeInternalsState["x"],
) {
  void nodes;
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = useLocalStorage.getState().darkMode;
  const { activeViewModeId, viewModes } = p.projectConfig;
  const topLevelSections = getActiveViewModeTopLevelSections(p);
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(p);
  const canFilterByView = Boolean(
    activeViewModeId && viewModes[activeViewModeId],
  );
  for (const sectionId of topLevelSectionIds) {
    const layout = topLevelSections[sectionId];
    if (
      !layout ||
      !shouldRenderTopLevelSectionNode(p, sectionId, canFilterByView)
    ) {
      continue;
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(p, sectionId);
    nodesMap.set(
      sectionId,
      buildTopLevelSectionNode({
        darkMode,
        layout,
        sectionId,
        sectionImpl,
      }),
    );
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
  sectionImpl: BaseSectionImplUnion | null,
  state: ZustandProjectState,
  output: Record<string, Array<string>>,
) {
  if (!sectionImpl) {
    return;
  }
  if (isBaseParentSectionImpl(sectionImpl)) {
    const displayedChildren: string[] = [];
    for (const childId of sectionImpl.children) {
      const childImpl = getEffectiveSectionImplIfPresent(state, childId);
      if (!childImpl) {
        continue;
      }
      displayedChildren.push(childId);
      getDisplayedSectionIdToChildrenHelper(childId, childImpl, state, output);
    }
    output[sectionId] = displayedChildren;
  } else {
    output[sectionId] = [];
  }
}

export function getDisplayedSectionIdToChildren(state: ZustandProjectState) {
  const output: Record<string, Array<string>> = {};
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);
  for (const sectionId of topLevelSectionIds) {
    const impl = getEffectiveSectionImplIfPresent(state, sectionId);
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

export function getSectionShouldRender(
  visibility: boolean,
  isEditingViewMode: boolean,
) {
  return isEditingViewMode || visibility;
}

export function getActiveViewModeConfig(state: SingleConfig) {
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

export function getActiveViewModeTopLevelSections(projectState: SingleConfig) {
  const { activeViewModeId, topLevelSections, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId || !(activeViewModeId in viewModes)) {
    return topLevelSections;
  }
  const viewMode = viewModes[activeViewModeId];
  const viewModeLayout = viewMode.topLevelSections;
  if (!viewModeLayout || Object.keys(viewModeLayout).length === 0) {
    return topLevelSections;
  }
  if (!topLevelSections || Object.keys(topLevelSections).length === 0) {
    return viewModeLayout;
  }
  return { ...topLevelSections, ...viewModeLayout };
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

function getSectionViewModeVisibilityIfPresent(
  sectionId: string,
  state: ZustandProjectState,
): {
  visibility: boolean;
  isEditingViewMode: boolean;
} | null {
  const { isEditingViewMode } = state.projectConfig;
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    return null;
  }
  return {
    visibility,
    isEditingViewMode,
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
  if (shareSession.isDeploymentMode) {
    return;
  }
  callOpenAPI(
    deleteSections({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: getActiveSectionUIIds(),
      },
    } as Parameters<typeof deleteSections>[0]),
  );
}

export function createTopLevelSectionLayoutDict(
  sections: SingleConfig["sections"],
  nodeInternals: ZustandNodeInternalsState["x"],
  existingLayouts:
    | SingleConfig["projectConfig"]["topLevelSections"]
    | null = null,
) {
  const topLevelSections = copyExistingTopLevelSectionLayouts(
    sections,
    existingLayouts,
  );
  for (const c of nodeInternals.values()) {
    if (c.id in sections) {
      topLevelSections[c.id] = buildTopLevelSectionLayout(
        c,
        topLevelSections[c.id],
      );
    }
  }
  return topLevelSections;
}

export type TopLevelSectionLayoutMap =
  SingleConfig["projectConfig"]["topLevelSections"];

export function copyExistingTopLevelSectionLayouts(
  sections: SingleConfig["sections"],
  existingLayouts: TopLevelSectionLayoutMap | null,
): TopLevelSectionLayoutMap {
  const nextLayouts: TopLevelSectionLayoutMap = {};
  if (!existingLayouts) {
    return nextLayouts;
  }
  for (const [sectionId, layout] of Object.entries(existingLayouts)) {
    if (sectionId in sections) {
      nextLayouts[sectionId] = { ...layout };
    }
  }
  return nextLayouts;
}

function createDefaultTopLevelSectionLayout(node: Node): TopLevelSectionLayout {
  return {
    x: node.position.x,
    y: node.position.y,
    zIndex: 0,
    w: null,
    h: null,
  };
}

function buildTopLevelSectionLayout(
  node: Node,
  existingLayout?: TopLevelSectionLayout,
): TopLevelSectionLayout {
  const nextLayout = existingLayout
    ? { ...existingLayout }
    : createDefaultTopLevelSectionLayout(node);
  nextLayout.x = node.position.x;
  nextLayout.y = node.position.y;
  if (node.zIndex !== undefined) {
    nextLayout.zIndex = node.zIndex;
  }
  if (getPositiveTopLevelLayoutDimension(node.width) !== null) {
    nextLayout.w = node.width;
  }
  if (getPositiveTopLevelLayoutDimension(node.height) !== null) {
    nextLayout.h = node.height;
  }
  return nextLayout;
}
