import _ from "lodash";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getActiveSectionsStore } from "./stores";
import type { WorkspaceHost } from "../workspaceHost";

export function getActiveSectionIds(host: WorkspaceHost): Array<string> {
  return getActiveSectionsStore(host).getState().activeIds;
}

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
