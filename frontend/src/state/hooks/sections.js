import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useSectionInfos } from "state/definitions";

export function useHasTempNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}

export function useHasPermanentNested(sectionId) {
  return useSectionInfos((x) => {
    const variantId = x.x[sectionId]?.variantId;
    return variantId ? x.variants[variantId].children.length > 0 : false;
  });
}
