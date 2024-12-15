import C from "constants/constants.json";
import _ from "lodash";
import {
  useActiveSection,
  useNodeInternals,
  useSectionInfos,
} from "state/definitions";
import { getHighestAncestor, getSectionType } from "./sectionInfos";
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

export function setAllSectionsAsActive() {
  setActiveSectionIds(Object.keys(useSectionInfos.getState().x));
}

export function setTopLevelNonGroupSectionsAsActive() {
  const topLevelSections = Array.from(useNodeInternals.getState().x.values());
  const nonGroup = topLevelSections.filter(
    (s) => getSectionType(s.id) !== C.GROUP,
  );
  setActiveSectionIds(nonGroup.map((x) => x.id));
}
