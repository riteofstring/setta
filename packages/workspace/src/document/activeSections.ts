import _ from "lodash";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { isWorkspaceSavedViewSectionVisible } from "../saved-views/state";
import { getActiveSectionsStore, getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceHost } from "../workspaceHost";

export function getActiveSectionIds(host: WorkspaceHost): Array<string> {
  return getActiveSectionsStore(host).getState().activeIds;
}

export function setActiveSectionIds(
  host: WorkspaceHost,
  ids: Array<string>,
): void {
  const document = getWorkspaceDocumentStore(host).getState();
  const visibleIds = ids.filter((sectionId) =>
    isWorkspaceSavedViewSectionVisible(
      document.savedViews,
      document.parentSectionMap,
      sectionId,
    ),
  );
  if (_.isEqual(getActiveSectionIds(host), visibleIds)) {
    return;
  }
  getActiveSectionsStore(host).setState({ activeIds: visibleIds });
  notifyWorkspaceDocumentChange(host, null);
}
