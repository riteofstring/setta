import _ from "lodash";
import { useActiveSections } from "./stores";

export function getActiveSectionIds(): Array<string> {
  return useActiveSections.getState().activeIds;
}

export function setActiveSectionIds(ids: Array<string>): void {
  if (_.isEqual(getActiveSectionIds(), ids)) {
    return;
  }
  useActiveSections.setState({ activeIds: ids });
}
