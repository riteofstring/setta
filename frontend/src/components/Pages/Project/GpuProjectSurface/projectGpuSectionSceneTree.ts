import {
  getCurrEffectiveSectionImplIfPresent,
  getEmbeddedAttachedTerminalForCodeSection,
  getSectionShouldRender,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import {
  getActiveViewModeTopLevelSections,
  shouldRenderTopLevelSectionNode,
} from "state/actions/sectionInfos/codeObjectsAndLayout";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

export function getProjectGpuRenderableTopLevelSectionIds(
  projectState: ZustandProjectState,
): readonly string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  const canFilterByView = Boolean(
    activeViewModeId && projectState.projectConfig.viewModes[activeViewModeId],
  );
  return getTopLevelSectionIdsForDisplay(projectState).filter((sectionId) => {
    const layout = topLevelSections[sectionId];
    return Boolean(
      layout &&
        shouldRenderTopLevelSectionNode(
          projectState,
          sectionId,
          canFilterByView,
        ) &&
        getCurrEffectiveSectionImplIfPresent(projectState, sectionId),
    );
  });
}

export function getRenderableProjectChildSectionIds(
  projectState: ZustandProjectState,
  sectionId: string,
  sectionImpl: BaseSectionImplUnion,
): readonly string[] {
  if (!isBaseParentSectionImpl(sectionImpl)) {
    return [];
  }
  const childIds = (sectionImpl.children ?? []).filter((childId) =>
    getCurrEffectiveSectionImplIfPresent(projectState, childId),
  );
  const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
    projectState,
    sectionId,
    childIds,
  );
  if (!embeddedTerminal?.isTerminalMinimized) {
    return childIds;
  }
  return childIds.filter(
    (childId) => childId !== embeddedTerminal.attachedTerminalId,
  );
}

export function shouldRenderProjectSceneSection(
  projectState: ZustandProjectState,
  sectionId: string,
): boolean {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId) {
    return true;
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return true;
  }
  const visibility = viewMode.visibilityBySectionId?.[sectionId];
  if (visibility === undefined) {
    return true;
  }
  return getSectionShouldRender(visibility, isEditingViewMode);
}
