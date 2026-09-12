import { closeWorkspaceMenu } from "../context-menu/workspaceMenuState";
import {
  getActiveSectionIds,
  setActiveSectionIds,
} from "../document/activeSections";
import { createNodesMapFromDocumentChildren } from "../document/nodeProjection";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import { forceDeactivateDnd } from "../dnd/dndState";
import { manualDndChildrenReset } from "../dnd/dndChildren";
import { resetItemDragState } from "../items/itemDragHandlers";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceSavedViewSectionVisible } from "./state";
import {
  getWorkspaceSavedViewsOperationDisabledReason,
  setWorkspaceSavedViewSectionVisibility,
} from "./operations";
import type { WorkspaceSavedViewsOperationResult } from "./types";
import {
  isWorkspaceSavedViewEditing,
  setWorkspaceSavedViewEditingState,
} from "./editingState";

export function setWorkspaceSavedViewEditing(
  host: WorkspaceHost,
  editing: boolean,
): boolean {
  if (editing === isWorkspaceSavedViewEditing(host)) {
    return false;
  }
  if (
    editing &&
    getWorkspaceSavedViewsOperationDisabledReason(host, "visibility") !== null
  ) {
    return false;
  }
  closeWorkspaceMenu(host, false);
  forceDeactivateDnd(host);
  resetItemDragState(host);
  setWorkspaceSavedViewEditingState(host, editing);
  manualDndChildrenReset(host);
  const document = getWorkspaceDocumentStore(host).getState();
  const nodes = createNodesMapFromDocumentChildren(
    host,
    document,
    getNodeInternalsStore(host).getState().x,
  );
  getNodeInternalsStore(host).setState({ x: nodes });
  if (!editing) {
    setActiveSectionIds(host, getActiveSectionIds(host));
  }
  return true;
}

export function getWorkspaceSavedViewSectionAction(
  document: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
): "hide" | "show" {
  const allVisible =
    sectionIds.length > 0 &&
    sectionIds.every((sectionId) =>
      isWorkspaceSavedViewSectionVisible(
        document.savedViews,
        document.parentSectionMap,
        sectionId,
      ),
    );
  return allVisible ? "hide" : "show";
}

function getSectionAndAncestorIds(
  document: WorkspaceDocumentState,
  sectionId: string,
): Array<string> {
  const ids: Array<string> = [];
  const visited = new Set<string>();
  let currentId: string | null = sectionId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new Error(`Section ${sectionId} has a cyclic parent chain.`);
    }
    visited.add(currentId);
    ids.push(currentId);
    currentId = document.parentSectionMap[currentId] ?? null;
  }
  return ids;
}

export function setWorkspaceSavedViewSectionsDisplayed(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
  visible: boolean,
): WorkspaceSavedViewsOperationResult {
  const document = getWorkspaceDocumentStore(host).getState();
  const targetIds = visible
    ? sectionIds.flatMap((sectionId) =>
        getSectionAndAncestorIds(document, sectionId),
      )
    : [...sectionIds];
  return setWorkspaceSavedViewSectionVisibility(host, targetIds, visible);
}
