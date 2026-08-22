import type { WorkspaceDocument } from "@setta/workspace";

import type { ListV2 } from "../backend/generatedContract";

type ForestSectionDescriptor = {
  canonicalId: string;
  workspaceId: string;
};

export function projectWorkspaceForestProposal(
  document: WorkspaceDocument,
  lists: ReadonlyArray<ListV2>,
  descriptors: ReadonlyArray<ForestSectionDescriptor>,
): {
  listChildren: Array<{ childSectionIds: string[]; listId: string }>;
  topLevelSectionIds: string[];
} | null {
  const descriptorByWorkspaceID = new Map(
    descriptors.map((descriptor) => [descriptor.workspaceId, descriptor]),
  );
  const canonicalIDs = new Set(
    descriptors.map((descriptor) => descriptor.canonicalId),
  );
  const placements = new Set<string>();
  const listChildren = projectListChildren(
    document,
    lists,
    descriptorByWorkspaceID,
    placements,
  );
  if (listChildren === null) {
    return null;
  }
  const topLevelSectionIds = projectTopLevelSectionIDs(
    document,
    descriptorByWorkspaceID,
  );
  if (!addUniquePlacements(placements, topLevelSectionIds)) {
    return null;
  }
  return placementsMatchCanonicalIDs(placements, canonicalIDs)
    ? { listChildren, topLevelSectionIds }
    : null;
}

function projectListChildren(
  document: WorkspaceDocument,
  lists: ReadonlyArray<ListV2>,
  descriptorByWorkspaceID: ReadonlyMap<string, ForestSectionDescriptor>,
  placements: Set<string>,
): Array<{ childSectionIds: string[]; listId: string }> | null {
  const listChildren: Array<{ childSectionIds: string[]; listId: string }> = [];
  for (const list of lists) {
    const section = document.sections[`python-canvas:list:${list.id}`];
    if (section === undefined) {
      return null;
    }
    const childSectionIds: string[] = [];
    for (const workspaceChildId of section.children) {
      const child = descriptorByWorkspaceID.get(workspaceChildId);
      if (
        child === undefined ||
        !addUniquePlacements(placements, [child.canonicalId])
      ) {
        return null;
      }
      childSectionIds.push(child.canonicalId);
    }
    listChildren.push({ childSectionIds, listId: list.id });
  }
  return listChildren;
}

function projectTopLevelSectionIDs(
  document: WorkspaceDocument,
  descriptorByWorkspaceID: ReadonlyMap<string, ForestSectionDescriptor>,
): string[] {
  return Object.entries(document.topLevelSections)
    .map(([workspaceId, layout]) => ({
      descriptor: descriptorByWorkspaceID.get(workspaceId),
      workspaceId,
      zIndex: layout.zIndex,
    }))
    .filter(
      (
        entry,
      ): entry is {
        descriptor: ForestSectionDescriptor;
        workspaceId: string;
        zIndex: number;
      } => entry.descriptor !== undefined,
    )
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex ||
        left.workspaceId.localeCompare(right.workspaceId),
    )
    .map(({ descriptor }) => descriptor.canonicalId);
}

function addUniquePlacements(
  placements: Set<string>,
  identifiers: ReadonlyArray<string>,
): boolean {
  if (identifiers.some((id) => placements.has(id))) {
    return false;
  }
  for (const id of identifiers) {
    placements.add(id);
  }
  return true;
}

function placementsMatchCanonicalIDs(
  placements: ReadonlySet<string>,
  canonicalIDs: ReadonlySet<string>,
): boolean {
  return (
    placements.size === canonicalIDs.size &&
    [...canonicalIDs].every((id) => placements.has(id))
  );
}
