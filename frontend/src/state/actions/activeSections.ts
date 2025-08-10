import _ from "lodash";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { getCurrEffectiveSectionImpl, getHighestAncestor } from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";
import { setZIndices } from "./sections/sectionPositions";

export function setActiveSectionIds(ids: Array<string>) {
  useProjectState.setState({ activeIds: ids });
}

export function addActiveSectionIds(ids: Array<string>) {
  useProjectState.setState((state) => ({
    activeIds: [...new Set([...state.activeIds, ...ids])],
  }));
}

export function removeActiveSectionIds(ids: Array<string>) {
  useProjectState.setState((state) => ({
    activeIds: _.difference(state.activeIds, ids),
  }));
}

export function clearActiveSectionIds() {
  useProjectState.setState({ activeIds: [] });
}

export function setActiveSectionIdAndUpdateZIndex(id: string) {
  setActiveSectionIds([id]);
  const highestAncestor = getHighestAncestor(id);
  setZIndices([highestAncestor], false);
}

export function selectAll() {
  const currActiveSections = useProjectState.getState().activeIds;

  // select all params within single active section
  if (currActiveSections.length === 1) {
    useProjectState.setState((state) => {
      const sectionId = currActiveSections[0];
      const ids = getAllVisibleParamsInSection(sectionId, state);
      for (const p of ids) {
        state.codeInfo[p].isSelected = true;
      }
    });
  } else {
    // select all sections
    setActiveSectionIds(Object.keys(useProjectState.getState().sections));
  }
}

export function setTopLevelNonGroupSectionsAsActive() {
  const p = useProjectState.getState();
  const { topLevelSections } = p.projectConfig;
  const nonGroup: Array<string> = [];
  for (const sectionId of Object.keys(topLevelSections)) {
    if (getCurrEffectiveSectionImpl(p, sectionId).type !== SectionTypeEnum.Group) {
      nonGroup.push(sectionId);
    }
  }
  setActiveSectionIds(nonGroup);
}
