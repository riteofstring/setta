import { getSectionChildren } from "state/actions/sectionInfos";
import { ZustandProjectState } from "state/definitions";

type RootSectionSelection = {
  rootIds: string[];
};

type TopLevelSectionSortKey = readonly [number, number, number, number, string];

export function getRootSelectedSectionIds(
  state: ZustandProjectState,
  sectionIds: string[],
): RootSectionSelection {
  const selectedSet = new Set(sectionIds);
  const rootIds: string[] = [];

  for (const sectionId of sectionIds) {
    let parentId = state.parentSectionMap[sectionId] ?? null;
    let hasSelectedAncestor = false;
    while (parentId) {
      if (selectedSet.has(parentId)) {
        hasSelectedAncestor = true;
        break;
      }
      parentId = state.parentSectionMap[parentId] ?? null;
    }

    if (!hasSelectedAncestor) {
      rootIds.push(sectionId);
    }
  }

  return { rootIds };
}

export function getSharedParentId(
  state: ZustandProjectState,
  sectionIds: string[],
): string | null | undefined {
  if (sectionIds.length === 0) {
    return undefined;
  }
  const parentMap = state.parentSectionMap;
  const firstParentId = parentMap[sectionIds[0]] ?? null;
  for (const sectionId of sectionIds) {
    const parentId = parentMap[sectionId] ?? null;
    if (parentId !== firstParentId) {
      return undefined;
    }
  }
  return firstParentId;
}

export function isDescendantOfSectionSelection(
  state: ZustandProjectState,
  candidateId: string,
  selectedSet: Set<string>,
): boolean {
  let currentId: string | null = candidateId;
  while (currentId) {
    if (selectedSet.has(currentId)) {
      return true;
    }
    currentId = state.parentSectionMap[currentId] ?? null;
  }
  return false;
}

export function orderSectionIdsByParent(
  state: ZustandProjectState,
  parentId: string | null,
  sectionIds: string[],
): string[] {
  if (sectionIds.length <= 1) {
    return sectionIds.slice();
  }
  if (!parentId) {
    return orderTopLevelSectionIds(state, sectionIds);
  }

  const selectedSet = new Set(sectionIds);
  const children = getSectionChildren(state, parentId);
  const ordered = children.filter((childId) => selectedSet.has(childId));
  if (ordered.length === sectionIds.length) {
    return ordered;
  }
  const seen = new Set(ordered);
  for (const sectionId of sectionIds) {
    if (!seen.has(sectionId)) {
      ordered.push(sectionId);
    }
  }
  return ordered;
}

function orderTopLevelSectionIds(
  state: ZustandProjectState,
  sectionIds: string[],
): string[] {
  const layouts = state.projectConfig.topLevelSections;
  const ordered = sectionIds.slice();
  ordered.sort((a, b) => {
    return compareTopLevelSectionSortKeys(
      getTopLevelSectionSortKey(layouts[a], a),
      getTopLevelSectionSortKey(layouts[b], b),
    );
  });
  return ordered;
}

function getTopLevelSectionSortKey(
  layout:
    | ZustandProjectState["projectConfig"]["topLevelSections"][string]
    | undefined,
  sectionId: string,
): TopLevelSectionSortKey {
  if (!layout) {
    return [1, 0, 0, 0, sectionId];
  }
  return [0, layout.y, layout.x, layout.zIndex ?? 0, sectionId];
}

function compareTopLevelSectionSortKeys(
  keyA: TopLevelSectionSortKey,
  keyB: TopLevelSectionSortKey,
): number {
  const layoutPresenceDiff = keyA[0] - keyB[0];
  if (layoutPresenceDiff !== 0) {
    return layoutPresenceDiff;
  }
  const yDiff = keyA[1] - keyB[1];
  if (yDiff !== 0) {
    return yDiff;
  }
  const xDiff = keyA[2] - keyB[2];
  if (xDiff !== 0) {
    return xDiff;
  }
  const zIndexDiff = keyA[3] - keyB[3];
  if (zIndexDiff !== 0) {
    return zIndexDiff;
  }
  return keyA[4].localeCompare(keyB[4]);
}
