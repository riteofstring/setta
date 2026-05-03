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

export function getProjectGpuSceneSectionIds(
  projectState: ZustandProjectState,
): readonly string[] {
  const sectionIds: string[] = [];
  const seenSectionIds = new Set<string>();
  for (const sectionId of getProjectGpuRenderableTopLevelSectionIds(
    projectState,
  )) {
    const sectionImpl = getCurrEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (!sectionImpl) {
      continue;
    }
    appendProjectGpuSceneSectionIds({
      projectState,
      sectionId,
      sectionIds,
      sectionImpl,
      seenSectionIds,
    });
  }
  return sectionIds;
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

function appendProjectGpuSceneSectionIds({
  projectState,
  sectionId,
  sectionIds,
  sectionImpl,
  seenSectionIds,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionIds: string[];
  readonly sectionImpl: BaseSectionImplUnion;
  readonly seenSectionIds: Set<string>;
}) {
  if (seenSectionIds.has(sectionId)) {
    throw new Error(`Duplicate project GPU scene section ${sectionId}.`);
  }
  seenSectionIds.add(sectionId);
  sectionIds.push(sectionId);
  for (const childSectionId of getRenderableProjectChildSectionIds(
    projectState,
    sectionId,
    sectionImpl,
  )) {
    if (!shouldRenderProjectSceneSection(projectState, childSectionId)) {
      continue;
    }
    const childImpl = getCurrEffectiveSectionImplIfPresent(
      projectState,
      childSectionId,
    );
    if (!childImpl) {
      continue;
    }
    appendProjectGpuSceneSectionIds({
      projectState,
      sectionId: childSectionId,
      sectionIds,
      sectionImpl: childImpl,
      seenSectionIds,
    });
  }
}
