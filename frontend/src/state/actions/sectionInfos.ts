export { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
export {
  setCurrEffectiveCodeObjImplValue,
  setCurrEffectiveSectionImplValue,
  setEffectiveImplValue,
  setSectionVariantImplValue,
} from "./sectionEffectiveImplMutations";
export {
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
  getParamDisplayName,
  getSectionCore,
  getSectionVariant,
  getVariantBaseAndEffectiveSectionImpl,
  isManagedChatSection,
} from "./sectionEffectiveImpls";
export {
  getHighestAncestor,
  getSectionDescendants,
  getSectionInfo,
  resetAllSectionsToDefaultVersions,
  resetSectionsToDefaultVersions,
  setSectionChildren,
} from "./sectionHierarchy";
export {
  getAttachedTerminalParentIdForTerminalSection,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
  isBaseCodeSectionType,
} from "./sectionLayoutQueries";
export {
  getCurrShownParamIds,
  updateShownParamIdsForPinnedParams,
} from "./sectionShownParams";
export { mergeStreamingChatSections } from "./sectionStreamingMerge";
export { clearToolArgumentPreviewForProjectState } from "./sectionToolArgumentPreview";

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
