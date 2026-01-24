import { getSectionChildren } from "state/actions/sectionInfos";
import { ZustandProjectState } from "state/definitions";

type RootSectionSelection = {
  rootIds: string[];
  droppedIds: string[];
};

export function getRootSelectedSectionIds(
  state: ZustandProjectState,
  sectionIds: string[],
): RootSectionSelection {
  const selectedSet = new Set(sectionIds);
  const rootIds: string[] = [];
  const droppedIds: string[] = [];

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

    if (hasSelectedAncestor) {
      droppedIds.push(sectionId);
    } else {
      rootIds.push(sectionId);
    }
  }

  return { rootIds, droppedIds };
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
    const layoutA = layouts[a];
    const layoutB = layouts[b];
    if (!layoutA && !layoutB) {
      return a.localeCompare(b);
    }
    if (!layoutA) {
      return 1;
    }
    if (!layoutB) {
      return -1;
    }
    if (layoutA.y !== layoutB.y) {
      return layoutA.y - layoutB.y;
    }
    if (layoutA.x !== layoutB.x) {
      return layoutA.x - layoutB.x;
    }
    const zIndexA = layoutA.zIndex ?? 0;
    const zIndexB = layoutB.zIndex ?? 0;
    if (zIndexA !== zIndexB) {
      return zIndexA - zIndexB;
    }
    return a.localeCompare(b);
  });
  return ordered;
}
