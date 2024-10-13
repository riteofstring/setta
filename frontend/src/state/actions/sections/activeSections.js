import _ from "lodash";
import { useActiveSection } from "state/definitions";
import { setZIndices } from "./sectionPositions";
import { getHighestAncestor } from "./sectionChildren";

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
