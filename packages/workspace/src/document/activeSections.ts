import _ from "lodash";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getActiveSectionsStore } from "./stores";
import type { WorkspaceHost } from "../workspaceHost";

export function getActiveSectionIds(host: WorkspaceHost): Array<string> {
  return getActiveSectionsStore(host).getState().activeIds;
}

// Selection is part of the controlled document (the reference persists it through
// `route_set_active_ids`), so a selection commit notifies the host like any other funnel.
export function setActiveSectionIds(
  host: WorkspaceHost,
  ids: Array<string>,
): void {
  if (_.isEqual(getActiveSectionIds(host), ids)) {
    return;
  }
  getActiveSectionsStore(host).setState({ activeIds: ids });
  notifyWorkspaceDocumentChange(host);
}
