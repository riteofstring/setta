export function getRootSelectedParamIds(
  parentById: Record<string, string | null>,
  selectedIds: string[],
): string[] {
  const selectedSet = new Set(selectedIds);
  return selectedIds.filter((paramId) => {
    let parentId = parentById[paramId] ?? null;
    while (parentId) {
      if (selectedSet.has(parentId)) {
        return false;
      }
      parentId = parentById[parentId] ?? null;
    }
    return true;
  });
}

export function getSharedParentId(
  parentById: Record<string, string | null>,
  paramIds: string[],
): string | null {
  if (paramIds.length === 0) {
    return null;
  }
  const firstParent = parentById[paramIds[0]] ?? null;
  if (!firstParent) {
    return null;
  }
  for (const paramId of paramIds) {
    if (parentById[paramId] !== firstParent) {
      return null;
    }
  }
  return firstParent;
}

export function isDescendantOfSelection(
  parentById: Record<string, string | null>,
  candidateId: string,
  selectedSet: Set<string>,
): boolean {
  let currentId: string | null = candidateId;
  while (currentId) {
    if (selectedSet.has(currentId)) {
      return true;
    }
    currentId = parentById[currentId] ?? null;
  }
  return false;
}

export function resolveFullIndexForVisibleInsertion({
  targetVisibleIndex,
  movingIds,
  visibleSiblings,
  fullChildren,
}: {
  targetVisibleIndex: number;
  movingIds: Set<string>;
  visibleSiblings: string[];
  fullChildren: string[];
}): number | null {
  const remainingChildren = fullChildren.filter((id) => !movingIds.has(id));
  const remainingVisible = visibleSiblings.filter((id) => !movingIds.has(id));
  if (targetVisibleIndex < 0 || targetVisibleIndex > remainingVisible.length) {
    return null;
  }
  if (remainingVisible.length === 0) {
    return remainingChildren.length;
  }
  if (targetVisibleIndex === remainingVisible.length) {
    const lastVisible = remainingVisible[remainingVisible.length - 1];
    const lastIndex = remainingChildren.indexOf(lastVisible);
    return lastIndex >= 0 ? lastIndex + 1 : remainingChildren.length;
  }
  const anchorId = remainingVisible[targetVisibleIndex];
  const anchorIndex = remainingChildren.indexOf(anchorId);
  if (anchorIndex < 0) {
    return remainingChildren.length;
  }
  return anchorIndex;
}
