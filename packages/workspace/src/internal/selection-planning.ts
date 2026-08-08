import type { InteractionPoint } from "./interaction-geometry.js";

export type SectionHierarchySnapshot = {
  rootSectionIds: readonly string[];
  childrenByParent: Readonly<Record<string, readonly string[]>>;
  parentByChild: Readonly<Record<string, string | null>>;
  rootPositions: Readonly<Record<string, InteractionPoint>>;
};

export type SelectionBlock = {
  sectionIds: readonly string[];
  sourceParentId: string | null;
};

export type SelectionBlockResult =
  { allowed: true; block: SelectionBlock } | { allowed: false; reason: string };

export function resolveSelectionBlock(
  selectedIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): SelectionBlockResult {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length === 0) {
    return { allowed: false, reason: "No sections are selected." };
  }

  const rootResult = removeSelectedDescendants(uniqueIds, hierarchy.parentByChild);
  if (!rootResult.allowed) {
    return rootResult;
  }
  const sharedParentResult = resolveSharedParent(rootResult.rootIds, hierarchy.parentByChild);
  if (!sharedParentResult.allowed) {
    return sharedParentResult;
  }
  const orderResult = orderSelectionRoots(
    rootResult.rootIds,
    sharedParentResult.parentId,
    hierarchy,
  );
  if (!orderResult.allowed) {
    return orderResult;
  }

  return {
    allowed: true,
    block: {
      sectionIds: orderResult.sectionIds,
      sourceParentId: sharedParentResult.parentId,
    },
  };
}

export function selectionContainsSectionOrAncestor(
  candidateId: string,
  selectionRootIds: ReadonlySet<string>,
  parentByChild: Readonly<Record<string, string | null>>,
): boolean {
  let currentId: string | null = candidateId;
  const visited = new Set<string>();
  while (currentId) {
    if (selectionRootIds.has(currentId)) {
      return true;
    }
    if (visited.has(currentId)) {
      throw new Error(`Parent lookup contains a cycle at section "${currentId}".`);
    }
    visited.add(currentId);
    currentId = parentByChild[currentId] ?? null;
  }
  return false;
}

type RootResolution =
  { allowed: true; rootIds: readonly string[] } | { allowed: false; reason: string };

function removeSelectedDescendants(
  selectedIds: readonly string[],
  parentByChild: Readonly<Record<string, string | null>>,
): RootResolution {
  const selectedSet = new Set(selectedIds);
  const rootIds: string[] = [];
  for (const sectionId of selectedIds) {
    const ancestorResult = hasSelectedAncestor(sectionId, selectedSet, parentByChild);
    if (!ancestorResult.allowed) {
      return ancestorResult;
    }
    if (!ancestorResult.hasSelectedAncestor) {
      rootIds.push(sectionId);
    }
  }
  return { allowed: true, rootIds };
}

type AncestorResult =
  { allowed: true; hasSelectedAncestor: boolean } | { allowed: false; reason: string };

function hasSelectedAncestor(
  sectionId: string,
  selectedSet: ReadonlySet<string>,
  parentByChild: Readonly<Record<string, string | null>>,
): AncestorResult {
  let parentId = parentByChild[sectionId] ?? null;
  const visited = new Set([sectionId]);
  while (parentId) {
    if (selectedSet.has(parentId)) {
      return { allowed: true, hasSelectedAncestor: true };
    }
    if (visited.has(parentId)) {
      return {
        allowed: false,
        reason: `Parent lookup contains a cycle at section "${parentId}".`,
      };
    }
    visited.add(parentId);
    parentId = parentByChild[parentId] ?? null;
  }
  return { allowed: true, hasSelectedAncestor: false };
}

type ParentResolution =
  { allowed: true; parentId: string | null } | { allowed: false; reason: string };

function resolveSharedParent(
  sectionIds: readonly string[],
  parentByChild: Readonly<Record<string, string | null>>,
): ParentResolution {
  const firstId = sectionIds[0];
  if (!firstId) {
    return { allowed: false, reason: "No selection roots remain." };
  }
  const parentId = parentByChild[firstId] ?? null;
  const hasMixedParents = sectionIds.some(
    (sectionId) => (parentByChild[sectionId] ?? null) !== parentId,
  );
  if (hasMixedParents) {
    return {
      allowed: false,
      reason: "Selected sections must share one parent for batch movement.",
    };
  }
  return { allowed: true, parentId };
}

type OrderResolution =
  { allowed: true; sectionIds: readonly string[] } | { allowed: false; reason: string };

function orderSelectionRoots(
  sectionIds: readonly string[],
  parentId: string | null,
  hierarchy: SectionHierarchySnapshot,
): OrderResolution {
  if (parentId) {
    return orderNestedSelection(sectionIds, parentId, hierarchy.childrenByParent);
  }
  return orderRootSelection(sectionIds, hierarchy);
}

function orderNestedSelection(
  sectionIds: readonly string[],
  parentId: string,
  childrenByParent: Readonly<Record<string, readonly string[]>>,
): OrderResolution {
  const selectedSet = new Set(sectionIds);
  const ordered = (childrenByParent[parentId] ?? []).filter((id) => selectedSet.has(id));
  if (ordered.length !== sectionIds.length) {
    return {
      allowed: false,
      reason: `Selected sections are not all direct children of "${parentId}".`,
    };
  }
  return { allowed: true, sectionIds: ordered };
}

function orderRootSelection(
  sectionIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): OrderResolution {
  const stackIndexById = new Map(
    hierarchy.rootSectionIds.map((sectionId, index) => [sectionId, index]),
  );
  for (const sectionId of sectionIds) {
    if (!hierarchy.rootPositions[sectionId] || !stackIndexById.has(sectionId)) {
      return {
        allowed: false,
        reason: `Top-level section "${sectionId}" is missing canonical layout data.`,
      };
    }
  }

  const ordered = sectionIds
    .slice()
    .sort((leftId, rightId) =>
      compareRootLayout(leftId, rightId, hierarchy.rootPositions, stackIndexById),
    );
  return { allowed: true, sectionIds: ordered };
}

function compareRootLayout(
  leftId: string,
  rightId: string,
  positions: Readonly<Record<string, InteractionPoint>>,
  stackIndexes: ReadonlyMap<string, number>,
): number {
  const left = positions[leftId];
  const right = positions[rightId];
  if (!left || !right) {
    return leftId.localeCompare(rightId);
  }
  return (
    left.y - right.y ||
    left.x - right.x ||
    (stackIndexes.get(leftId) ?? 0) - (stackIndexes.get(rightId) ?? 0) ||
    leftId.localeCompare(rightId)
  );
}
