import { getSectionItemVisibility } from "../items/itemListRegistry";
import { getActiveSectionIds, setActiveSectionIds } from "./activeSections";
import { isGroupSection } from "./documentSelectors";
import { setSelectedItems } from "./itemSelection";
import { getItemOrThrow } from "./itemTree";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSectionItemTree } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's two select-all actions (`selectAll` and `setTopLevelNonGroupSectionsAsActive`
// in `state/actions/activeSections.ts`) as canonical package operations. Both commit through the
// existing selection funnels, so the host is notified exactly once and every surface that reads
// selection — the Inspector, the Outline, the section chrome — agrees immediately.

// Selection order follows the canonical tree rather than the order rows were clicked in, and a
// row the section is not showing prunes its whole subtree, matching what the rendered list views
// resolve for drag and keyboard movement.
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

// The reference narrows select-all to the parameters of a single active section but never
// finished the branch (it logs the resolved ids). The package implements it over the rows that
// section is actually showing, and declines when it has none so the chord stays with the browser.
function selectAllVisibleItems(host: WorkspaceHost, sectionId: string): boolean {
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
  if (soleActiveId !== undefined) {
    return selectAllVisibleItems(host, soleActiveId);
  }
  setActiveSectionIds(
    host,
    Object.keys(getWorkspaceDocumentStore(host).getState().sections),
  );
  return true;
}

// The reference's companion action: every top-level section that is not a group, so a selection
// covers the workspace's own sections without also carrying the containers around them. An empty
// result clears the selection, exactly as the reference commits it.
export function selectAllTopLevelNonGroupSections(host: WorkspaceHost): void {
  const state = getWorkspaceDocumentStore(host).getState();
  setActiveSectionIds(
    host,
    Object.keys(state.topLevelSections).filter((sectionId) => {
      const section = state.sections[sectionId];
      return section !== undefined && !isGroupSection(section);
    }),
  );
}
