import _ from "lodash";
import { useNodeInternals, useProjectState } from "state/definitions";
import { getHighestAncestor, getSectionType } from "./sectionInfos";
import { getAllVisibleParamsInSection } from "./sections/sectionContents";
import { setZIndices } from "./sections/sectionPositions";

export function setActiveSectionIds(ids) {
  useProjectState.setState({ activeIds: ids });
}

export function addActiveSectionIds(ids) {
  useProjectState.setState((state) => ({
    activeIds: [...new Set([...state.activeIds, ...ids])],
  }));
}

export function removeActiveSectionIds(ids) {
  useProjectState.setState((state) => ({
    activeIds: _.difference(state.activeIds, ids),
  }));
}

export function clearActiveSectionIds() {
  useProjectState.setState({ activeIds: [] });
}

export function setActiveSectionIdAndUpdateZIndex(id) {
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
  const topLevelSections = Array.from(useNodeInternals.getState().x.values());
  const nonGroup = topLevelSections.filter(
    (s) => getSectionType(s.id) !== UITypeNameEnum.GROUP,
  );
  setActiveSectionIds(nonGroup.map((x) => x.id));
}
