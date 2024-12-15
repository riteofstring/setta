import C from "constants/constants.json";
import _ from "lodash";
import {
  useActiveSection,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import { findAllParametersAndPathMaps } from "utils/getDescendants";
import {
  getCodeChildrenAndParentCodeInfoId,
  getHighestAncestor,
  getSectionType,
} from "./sectionInfos";
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
      const { codeInfoChildren, parentCodeInfoId, startAtDepth } =
        getCodeChildrenAndParentCodeInfoId(sectionId, state);

      const { pathMap } = findAllParametersAndPathMaps({
        allCodeInfo: state.codeInfo,
        codeInfoChildren,
        startingId: parentCodeInfoId,
      });
      const paramsAtStartDepth = new Set();
      for (const path of Object.values(pathMap)) {
        path.slice(startAtDepth).forEach((p) => paramsAtStartDepth.add(p));
      }
      for (const p of paramsAtStartDepth) {
        state.codeInfo[p].isSelected = true;
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
