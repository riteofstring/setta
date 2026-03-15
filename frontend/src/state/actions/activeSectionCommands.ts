import { getActiveSectionUIIds } from "state/activeSectionSelection";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { setActiveSectionIds } from "./activeSectionSync";
import { getTopLevelSectionIdsForDisplay } from "./sectionDisplayQueries";
import { getCurrEffectiveSectionImpl } from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";

export function pruneActiveSectionIdsForViewMode(
  viewModeId: string | null | undefined,
  isEditingViewMode: boolean,
) {
  if (isEditingViewMode) {
    return;
  }
  const state = useProjectState.getState();
  const resolvedViewModeId = viewModeId ?? state.projectConfig.activeViewModeId;
  if (!resolvedViewModeId) {
    return;
  }
  const viewMode = state.projectConfig.viewModes[resolvedViewModeId];
  if (!viewMode) {
    throw new Error(`Active view mode ${resolvedViewModeId} not found`);
  }
  const nextIds = getActiveSectionUIIds().filter((sectionId) => {
    const visibility = viewMode.visibilityBySectionId[sectionId];
    if (visibility === undefined) {
      throw new Error(
        `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
      );
    }
    return visibility;
  });
  setActiveSectionIds(nextIds);
}

export function clearActiveSectionIds() {
  if (getActiveSectionUIIds().length === 0) {
    return;
  }
  setActiveSectionIds([]);
}

export function selectAll() {
  const currActiveSections = getActiveSectionUIIds();

  // select all params within single active section
  if (currActiveSections.length === 1) {
    useProjectState.setState((state) => {
      const sectionId = currActiveSections[0];
      if (sectionId) {
        const ids = getAllVisibleParamsInSection(state, sectionId);
        //TODO set selected params:
        console.log("selectAll ids", ids);
      }
    });
    return;
  }

  setActiveSectionIds(Object.keys(useProjectState.getState().sections));
}

export function setTopLevelNonGroupSectionsAsActive() {
  const state = useProjectState.getState();
  const nonGroup: Array<string> = [];
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);
  for (const sectionId of topLevelSectionIds) {
    if (
      getCurrEffectiveSectionImpl(state, sectionId).type !==
      SectionTypeEnum.Group
    ) {
      nonGroup.push(sectionId);
    }
  }
  setActiveSectionIds(nonGroup);
}
