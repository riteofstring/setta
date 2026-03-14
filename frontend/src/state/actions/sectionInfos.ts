import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { Node } from "forks/xyflow/core/types";
import {
  getMessageCompletenessScore,
  mergeChatMessages,
} from "state/actions/chatMergeUtils";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import {
  useProjectState,
  ZustandNodeInternalsState,
  ZustandProjectState,
} from "state/definitions";
import { useToolArgumentPreview } from "state/stores/aiStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  BaseChatMessageUnion,
  BaseSectionImplUnion,
  isBaseChildlessCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ProjectStateSingleConfig,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
  getEffectiveCodeObjImplIfPresent,
  getEffectiveImpl,
  getEffectiveSectionImplIfPresent,
  setCurrEffectiveSectionImplValue,
  setEffectiveImplValue,
} from "./sectionEffectiveImpls";
import { getActiveViewModeTopLevelSections } from "./topLevelSectionLayouts";

export { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
export {
  getAttachedTerminalParentIdForTerminalSection,
  getCodeObjCore,
  getCodeObjImpl,
  getCurrCodeObjVariant,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveCodeObjImplOfType,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplIfPresent,
  getCurrEffectiveSectionImplOfType,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  getCurrSectionVariant,
  getCurrSectionVariantId,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  getParamDisplayName,
  getSectionChildren,
  getSectionCore,
  getSectionIsHorizontalOrientation,
  getSectionType,
  getSectionVariant,
  getVariantBaseAndEffectiveSectionImpl,
  isBaseCodeSectionType,
  isManagedChatSection,
  setCurrEffectiveCodeObjImplValue,
  setCurrEffectiveSectionImplValue,
  setSectionVariantImplValue,
} from "./sectionEffectiveImpls";

type ChatSectionImpl = Extract<
  BaseSectionImplUnion,
  { type: SectionTypeEnum.Chat }
>;

export function mergeStreamingChatSections(
  projectState: ProjectStateSingleConfig,
  currentState: ZustandProjectState,
): string[] {
  const mergedSectionIds: string[] = [];
  const incomingVariantMap = projectState.projectConfig.sectionVariantMap;
  const currentVariantMap = currentState.projectConfig.sectionVariantMap;

  for (const [sectionId, variantId] of Object.entries(incomingVariantMap)) {
    const variant = projectState.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const incomingCore = projectState.sections[sectionId];
    if (!incomingCore) {
      continue;
    }
    const incomingImpl = projectState.sectionImpls[variant.impl];
    if (!incomingImpl || incomingImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentVariantId = currentVariantMap[sectionId];
    if (!currentVariantId) {
      continue;
    }
    const currentVariant = currentState.sectionVariants[currentVariantId];
    if (!currentVariant) {
      continue;
    }
    const currentImpl = currentState.sectionImpls[currentVariant.impl];
    if (!currentImpl || currentImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentCore = currentState.sections[sectionId];
    if (!currentCore) {
      continue;
    }
    const incomingChat = getEffectiveImpl(
      incomingImpl,
      incomingCore,
      variant,
    ) as ChatSectionImpl;
    const currentChat = getEffectiveImpl(
      currentImpl,
      currentCore,
      currentVariant,
    ) as ChatSectionImpl;

    const incomingMessages = Array.isArray(incomingChat.messages)
      ? incomingChat.messages
      : [];
    const currentMessages = Array.isArray(currentChat.messages)
      ? currentChat.messages
      : [];
    const incomingToolArgs = incomingChat.toolCallArguments ?? {};
    const currentToolArgs = currentChat.toolCallArguments ?? {};
    const incomingInputText = incomingChat.inputText ?? "";
    const currentInputText = currentChat.inputText ?? "";
    const shouldPreserveStreaming = isSectionStreamActive(sectionId);
    const shouldMergeFast =
      shouldPreserveStreaming ||
      currentMessages.length > incomingMessages.length ||
      Object.keys(currentToolArgs).length >
        Object.keys(incomingToolArgs).length ||
      currentInputText.length > incomingInputText.length;
    const shouldMerge = shouldMergeFast
      ? true
      : hasMoreCompleteChatMessages(currentMessages, incomingMessages);
    if (!shouldMerge) {
      continue;
    }

    const mergedMessages = mergeChatMessages(incomingMessages, currentMessages);
    const mergedToolArgs = {
      ...incomingToolArgs,
      ...currentToolArgs,
    };
    const mergedInputText =
      currentInputText.length > incomingInputText.length
        ? currentInputText
        : incomingInputText;
    const mergedWaitingForResponse = shouldPreserveStreaming
      ? incomingChat.waitingForResponse || currentChat.waitingForResponse
      : incomingChat.waitingForResponse;
    setEffectiveImplValue<"ChatSection">(incomingImpl, incomingCore, variant, {
      messages: mergedMessages,
      toolCallArguments: mergedToolArgs,
      inputText: mergedInputText,
      waitingForResponse: mergedWaitingForResponse,
    });
    mergedSectionIds.push(sectionId);
  }

  return mergedSectionIds;
}

function hasMoreCompleteChatMessages(
  currentMessages: Array<BaseChatMessageUnion>,
  incomingMessages: Array<BaseChatMessageUnion>,
): boolean {
  if (currentMessages.length === 0) {
    return false;
  }
  if (incomingMessages.length === 0) {
    return currentMessages.length > 0;
  }
  const incomingById = new Map<string, BaseChatMessageUnion>();
  for (const message of incomingMessages) {
    incomingById.set(message.id, message);
  }
  for (const message of currentMessages) {
    const incoming = incomingById.get(message.id);
    if (!incoming) {
      return true;
    }
    if (
      getMessageCompletenessScore(message) >
      getMessageCompletenessScore(incoming)
    ) {
      return true;
    }
  }
  return false;
}

export function getTopLevelSectionIdsForDisplay(
  projectState: ZustandProjectState,
): string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  return Object.keys(topLevelSections).filter((sectionId) => {
    // Only true top-level sections should be rendered as React Flow nodes. If a
    // section has a parent, it will be rendered via the nested section tree.
    const parentId = projectState.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      return false;
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    return sectionImpl !== null;
  });
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
  const nextPinnedTopLevel: Array<string> = [];
  const nextUnpinnedTopLevel: Array<string> = [];
  for (const paramId of shown.pinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  for (const paramId of shown.unpinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  const nextPinnedRequired: Record<string, Array<string>> = {};
  const nextUnpinnedRequired: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(
    shown.pinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }
  for (const [paramId, path] of Object.entries(
    shown.unpinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }

  state.shownParamIds[variantId] = {
    pinned: {
      ...shown.pinned,
      topLevelParamIds: nextPinnedTopLevel,
      requiredParamIdsToPaths: nextPinnedRequired,
    },
    unpinned: {
      ...shown.unpinned,
      topLevelParamIds: nextUnpinnedTopLevel,
      requiredParamIdsToPaths: nextUnpinnedRequired,
    },
  };
}

export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
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

export function clearToolArgumentPreviewForProjectState(
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
  const darkMode = useLocalStorage.getState().darkMode;
  const { activeViewModeId, viewModes } = p.projectConfig;
  const topLevelSections = getActiveViewModeTopLevelSections(p);
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(p);
  const canFilterByView =
    Boolean(activeViewModeId) &&
    Boolean(activeViewModeId && viewModes[activeViewModeId]);

  for (const sectionId of topLevelSectionIds) {
    const layout = topLevelSections[sectionId];
    if (!layout) {
      continue;
    }
    if (canFilterByView) {
      const visibilityInfo = getSectionViewModeVisibilityIfPresent(
        sectionId,
        p,
      );
      if (!visibilityInfo) {
        continue;
      }
      if (
        !getSectionShouldRender(
          visibilityInfo.visibility,
          visibilityInfo.isEditingViewMode,
        )
      ) {
        continue;
      }
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(p, sectionId);
    const sectionTheme =
      sectionImpl?.styleColor !== null &&
      sectionImpl?.styleColor !== undefined &&
      sectionImpl.styleColor.trim() !== ""
        ? deriveSectionStyleTheme(sectionImpl.styleColor, darkMode)
        : null;
    nodesMap.set(sectionId, {
      id: sectionId,
      position: { x: layout.x, y: layout.y },
      width: nodes.get(sectionId)?.width ?? layout.w,
      height: nodes.get(sectionId)?.height ?? layout.h,
      zIndex: layout.zIndex,
      tempZIndex: layout.zIndex,
      type: sectionImpl?.type,
      style: sectionTheme ? { background: sectionTheme.bg } : undefined,
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

export function getActiveViewModeConfig(state: ProjectStateSingleConfig) {
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

function getSectionViewModeVisibilityIfPresent(
  sectionId: string,
  state: ZustandProjectState,
): { visibility: boolean; isEditingViewMode: boolean } | null {
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
