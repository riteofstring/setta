import C from "constants/constants.json";
import _ from "lodash";
import {
  useActiveSection,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import {
  getCodeInfoCol,
  getHighestAncestor,
  getSectionType,
  getSectionVariant,
} from "./sectionInfos";
import { getParamIdsToShowInArea } from "./sections/sectionContents";
import { setZIndices } from "./sections/sectionPositions";

export function setActiveSectionIds(ids) {
  useActiveSection.setState({ ids });
}

export function addActiveSectionIds(ids) {
  useActiveSection.setState((state) => ({
    ids: [...new Set([...state.ids, ...ids])],
  }));
}

export function removeActiveSectionIds(ids) {
  useActiveSection.setState((state) => ({ ids: _.difference(state.ids, ids) }));
}

export function clearActiveSectionIds() {
  useActiveSection.setState({ ids: [] });
}

export function setActiveSectionIdAndUpdateZIndex(id) {
  setActiveSectionIds([id]);
  const highestAncestor = getHighestAncestor(id);
  setZIndices([highestAncestor], false);
}

export function selectAll() {
  const currActiveSections = useActiveSection.getState().ids;

  // select all params within single active section
  if (currActiveSections.length === 1) {
    useSectionInfos.setState((state) => {
      const sectionId = currActiveSections[0];
      // only select the top level params
      const {topLevelParamIds} = getParamIdsToShowInArea(
        false,
        state.codeInfo,
        getCodeInfoCol(sectionId, state).children,
        getSectionVariant(sectionId, state).selectedItem,
      );
      console.log("paramIds", topLevelParamIds);
      for (const p of topLevelParamIds) {
        state.codeInfo[p].isSelected = true;
        console.log("set to true");
      }
    });
  } else {
    // select all sections
    setActiveSectionIds(Object.keys(useSectionInfos.getState().x));
  }
}

export function setTopLevelNonGroupSectionsAsActive() {
  const topLevelSections = Array.from(useNodeInternals.getState().x.values());
  const nonGroup = topLevelSections.filter(
    (s) => getSectionType(s.id) !== C.GROUP,
  );
  setActiveSectionIds(nonGroup.map((x) => x.id));
}
