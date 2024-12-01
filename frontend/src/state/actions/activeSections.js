import _ from "lodash";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { getHighestAncestor } from "./sectionInfo";
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
