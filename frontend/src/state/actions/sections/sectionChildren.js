import { getSectionParentId } from "../sectionInfo";

export function getHighestAncestor(
  sectionId,
  parentIdGetter = getSectionParentId,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getAllSectionChildrenIds(
  sectionIds,
  sectionInfoState,
  sectionVariantState,
) {
  const ids = [...sectionIds];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    ids.push(
      ...sectionVariantState[sectionInfoState[currId].variantId].children,
    );
    idx += 1;
  }
  return ids;
}
