import { notifyWorkspaceDocumentChange } from "./documentChangeCallback.js";
import { isWorkspaceSavedViewEditing } from "../saved-views/editingState.js";
import { isWorkspaceSavedViewSectionVisible } from "../saved-views/state.js";
import { getActiveSectionsStore, getWorkspaceDocumentStore } from "./stores.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { deepEqual } from "../state/deepEqual.js";

export function getActiveSectionIds(host: WorkspaceHost): Array<string> {
  return getActiveSectionsStore(host).getState().activeIds;
}

export function setActiveSectionIds(
  host: WorkspaceHost,
  ids: Array<string>,
): void {
  const document = getWorkspaceDocumentStore(host).getState();
  const includeHidden =
    document.savedViews !== null && isWorkspaceSavedViewEditing(host);
  const visibleIds = ids.filter(
    (sectionId) =>
      includeHidden ||
      isWorkspaceSavedViewSectionVisible(
        document.savedViews,
        document.parentSectionMap,
        sectionId,
      ),
  );
  if (deepEqual(getActiveSectionIds(host), visibleIds)) {
    return;
  }
  getActiveSectionsStore(host).setState({ activeIds: visibleIds });
  notifyWorkspaceDocumentChange(host, null);
}
