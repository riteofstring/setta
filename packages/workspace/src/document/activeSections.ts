import _ from "lodash";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { useActiveSections } from "./stores";

export function getActiveSectionIds(): Array<string> {
  return useActiveSections.getState().activeIds;
}

// Selection is part of the controlled document (the reference persists it through
// `route_set_active_ids`), so a selection commit notifies the host like any other funnel.
export function setActiveSectionIds(ids: Array<string>): void {
  if (_.isEqual(getActiveSectionIds(), ids)) {
    return;
  }
  useActiveSections.setState({ activeIds: ids });
  notifyWorkspaceDocumentChange();
}
