import { matchSorter } from "match-sorter";
import { buildItemParentMap, getItemOrThrow } from "../document/itemTree";
import { getWorkspaceItemSearchableText } from "../document/sectionKindRegistry";
import type {
  WorkspaceSection,
  WorkspaceSectionItemTree,
} from "../document/types";

// Frozen main's `GetParamSwitch` filter in item terms. It fuzzy-matches display names, keeps
// canonical row order, and includes every ancestor on a matching item's path. The package uses
// typed presentation labels directly and delegates only custom opaque item text to the owning
// section kind's explicit frozen-snapshot callback.

type WorkspaceItemFilterResult = {
  filterActive: boolean;
  matchingItemIds: ReadonlySet<string>;
  visibleItemIds: ReadonlySet<string>;
};

function collectReachableItemIds(
  itemTree: WorkspaceSectionItemTree,
): Array<string> {
  const itemIds: Array<string> = [];

  function walk(parentId: string): void {
    for (const childId of getItemOrThrow(itemTree, parentId).children) {
      itemIds.push(childId);
      walk(childId);
    }
  }

  walk(itemTree.rootId);
  return itemIds;
}

function includeMatchingPaths(
  itemTree: WorkspaceSectionItemTree,
  matchingItemIds: ReadonlySet<string>,
): Set<string> {
  const parentById = buildItemParentMap(itemTree);
  const visibleItemIds = new Set<string>();
  for (const matchingItemId of matchingItemIds) {
    let itemId: string | null = matchingItemId;
    while (itemId && itemId !== itemTree.rootId) {
      visibleItemIds.add(itemId);
      itemId = parentById[itemId] ?? null;
    }
  }
  return visibleItemIds;
}

export function filterWorkspaceSectionItems(
  section: WorkspaceSection,
  query: string,
): WorkspaceItemFilterResult {
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Section ${section.id} has no item tree to filter.`);
  }
  const itemIds = collectReachableItemIds(itemTree);
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    const allItemIds = new Set(itemIds);
    return {
      filterActive: false,
      matchingItemIds: allItemIds,
      visibleItemIds: allItemIds,
    };
  }

  const candidates = itemIds.map((itemId) => ({
    itemId,
    searchableText: getWorkspaceItemSearchableText(
      section,
      getItemOrThrow(itemTree, itemId),
    ),
  }));
  const matchedCandidates = matchSorter(candidates, normalizedQuery, {
    keys: ["searchableText"],
  });
  const matchingItemIds = new Set(
    matchedCandidates.map(({ itemId }) => itemId),
  );

  return {
    filterActive: true,
    matchingItemIds,
    visibleItemIds: includeMatchingPaths(itemTree, matchingItemIds),
  };
}
