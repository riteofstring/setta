import { getSectionItemVisibility } from "../items/itemListRegistry";
import { getActiveSectionIds, setActiveSectionIds } from "./activeSections";
import { isGroupSection } from "./documentSelectors";
import { setSelectedItems } from "./itemSelection";
import { getItemOrThrow } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionItemTree } from "./types";

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
function selectAllVisibleItems(sectionId: string): boolean {
  const itemTree =
    useWorkspaceDocument.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    return false;
  }
  const visibility = getSectionItemVisibility(sectionId);
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
  setSelectedItems(sectionId, itemIds);
  return true;
}

export function selectAllInWorkspace(): boolean {
  const activeIds = getActiveSectionIds();
  const soleActiveId = activeIds.length === 1 ? activeIds[0] : undefined;
  if (soleActiveId !== undefined) {
    return selectAllVisibleItems(soleActiveId);
  }
  setActiveSectionIds(Object.keys(useWorkspaceDocument.getState().sections));
  return true;
}

// The reference's companion action: every top-level section that is not a group, so a selection
// covers the workspace's own sections without also carrying the containers around them. An empty
// result clears the selection, exactly as the reference commits it.
export function selectAllTopLevelNonGroupSections(): void {
  const state = useWorkspaceDocument.getState();
  setActiveSectionIds(
    Object.keys(state.topLevelSections).filter((sectionId) => {
      const section = state.sections[sectionId];
      return section !== undefined && !isGroupSection(section);
    }),
  );
}
