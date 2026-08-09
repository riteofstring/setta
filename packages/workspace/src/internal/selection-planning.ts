import type { InteractionPoint } from "./interaction-geometry.js";

export type SectionHierarchySnapshot = {
  rootSectionIds: readonly string[];
  childrenByParent: Readonly<Record<string, readonly string[]>>;
  parentByChild: Readonly<Record<string, string | null>>;
  rootPositions: Readonly<Record<string, InteractionPoint>>;
};

export type SelectionBlock = {
  sectionIds: readonly string[];
  sourceParentIds: readonly (string | null)[];
};

export type SelectionBlockRejectionCode =
  "empty-selection" | "parent-cycle" | "root-layout-missing" | "selection-not-direct-children";

type SelectionBlockRejection = {
  allowed: false;
  code: SelectionBlockRejectionCode;
  reason: string;
};

export type SelectionBlockResult =
  { allowed: true; block: SelectionBlock } | SelectionBlockRejection;

export function resolveSelectionBlock(
  selectedIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): SelectionBlockResult {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length === 0) {
    return { allowed: false, code: "empty-selection", reason: "No sections are selected." };
  }

  const rootResult = removeSelectedDescendants(uniqueIds, hierarchy.parentByChild);
  if (!rootResult.allowed) {
    return rootResult;
  }
  const orderResult = orderSelectionRoots(rootResult.rootIds, hierarchy);
  if (!orderResult.allowed) {
    return orderResult;
  }

  return {
    allowed: true,
    block: {
      sectionIds: orderResult.sectionIds,
      sourceParentIds: orderResult.sectionIds.map(
        (sectionId) => hierarchy.parentByChild[sectionId] ?? null,
      ),
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

type RootResolution = { allowed: true; rootIds: readonly string[] } | SelectionBlockRejection;

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

type AncestorResult = { allowed: true; hasSelectedAncestor: boolean } | SelectionBlockRejection;

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
        code: "parent-cycle",
        reason: `Parent lookup contains a cycle at section "${parentId}".`,
      };
    }
    visited.add(parentId);
    parentId = parentByChild[parentId] ?? null;
  }
  return { allowed: true, hasSelectedAncestor: false };
}

type OrderResolution = { allowed: true; sectionIds: readonly string[] } | SelectionBlockRejection;

function orderSelectionRoots(
  sectionIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): OrderResolution {
  const firstId = sectionIds[0];
  if (!firstId) {
    return {
      allowed: false,
      code: "empty-selection",
      reason: "No selection roots remain.",
    };
  }
  const parentId = hierarchy.parentByChild[firstId] ?? null;
  if (sectionIds.every((sectionId) => (hierarchy.parentByChild[sectionId] ?? null) === parentId)) {
    return parentId
      ? orderNestedSelection(sectionIds, parentId, hierarchy.childrenByParent)
      : orderRootSelection(sectionIds, hierarchy);
  }
  return orderMixedSelection(sectionIds, hierarchy);
}

function orderMixedSelection(
  sectionIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): OrderResolution {
  const selected = new Set(sectionIds);
  const ordered: string[] = [];
  const stackIndexById = new Map(
    hierarchy.rootSectionIds.map((sectionId, index) => [sectionId, index]),
  );
  const roots = hierarchy.rootSectionIds
    .slice()
    .sort((leftId, rightId) =>
      compareRootLayout(leftId, rightId, hierarchy.rootPositions, stackIndexById),
    );
  const stack = roots.slice().reverse();
  while (stack.length > 0) {
    const sectionId = stack.pop();
    if (sectionId === undefined) break;
    if (selected.has(sectionId)) ordered.push(sectionId);
    const children = hierarchy.childrenByParent[sectionId] ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId !== undefined) stack.push(childId);
    }
  }
  if (ordered.length !== sectionIds.length) {
    return {
      allowed: false,
      code: "selection-not-direct-children",
      reason: "Selected sections are not all placed in the canonical hierarchy.",
    };
  }
  return { allowed: true, sectionIds: ordered };
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
      code: "selection-not-direct-children",
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
        code: "root-layout-missing",
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
