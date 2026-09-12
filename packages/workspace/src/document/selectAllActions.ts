import { getSectionItemVisibility } from "../items/itemListRegistry";
import { getActiveSectionIds, setActiveSectionIds } from "./activeSections";
import { isGroupSection } from "./documentSelectors";
import {
  getVisibleTopLevelSectionIdsForDisplay,
  isWorkspaceSectionVisible,
} from "./savedViewDisplay";
import { setSelectedItems } from "./itemSelection";
import { getItemOrThrow } from "./itemTree";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSectionItemTree } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

function listVisibleItemIdsInTreeOrder(
  itemTree: WorkspaceSectionItemTree,
  visibleItemIds: ReadonlySet<string>,
): Array<string> {
  const ordered: Array<string> = [];

  function walk(itemId: string) {
    for (const childId of getItemOrThrow(itemTree, itemId).children) {
      if (!visibleItemIds.has(childId)) {
        continue;
      }
      ordered.push(childId);
      walk(childId);
    }
  }

  walk(itemTree.rootId);
  return ordered;
}

function selectAllVisibleItems(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  const itemTree =
    getWorkspaceDocumentStore(host).getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    return false;
  }
  const visibility = getSectionItemVisibility(host, sectionId);
  if (!visibility) {
    return false;
  }
  const itemIds = listVisibleItemIdsInTreeOrder(
    itemTree,
    visibility.visibleItemIds,
  );
  if (itemIds.length === 0) {
    return false;
  }
  setSelectedItems(host, sectionId, itemIds);
  return true;
}

export function selectAllInWorkspace(host: WorkspaceHost): boolean {
  const activeIds = getActiveSectionIds(host);
  const soleActiveId = activeIds.length === 1 ? activeIds[0] : undefined;
  const state = getWorkspaceDocumentStore(host).getState();
  if (soleActiveId !== undefined) {
    if (!isWorkspaceSectionVisible(state, soleActiveId)) {
      return false;
    }
    return selectAllVisibleItems(host, soleActiveId);
  }
  setActiveSectionIds(
    host,
    Object.keys(state.sections).filter((sectionId) =>
      isWorkspaceSectionVisible(state, sectionId),
    ),
  );
  return true;
}

export function selectAllTopLevelNonGroupSections(host: WorkspaceHost): void {
  const state = getWorkspaceDocumentStore(host).getState();
  setActiveSectionIds(
    host,
    getVisibleTopLevelSectionIdsForDisplay(state).filter((sectionId) => {
      const section = state.sections[sectionId];
      return section !== undefined && !isGroupSection(section);
    }),
  );
}
