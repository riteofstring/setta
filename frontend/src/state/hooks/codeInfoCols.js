import _ from "lodash";
import { useSectionInfos } from "state/definitions";

export function useSectionCodeInfoChildren(sectionId) {
  return useSectionInfos((x) => {
    const { codeInfoColId } = x.variants[x.x[sectionId].variantId];
    return x.codeInfoCols[codeInfoColId]["children"];
  });
}

export function useCodeInfoChildren(sectionId, codeInfoId) {
  return useSectionInfos((x) => {
    const { codeInfoColId } = x.variants[x.x[sectionId].variantId];
    return x.codeInfoCols[codeInfoColId]["children"][codeInfoId] ?? [];
  }, _.isEqual);
}

export function useCodeInfoHasChildren(sectionId, codeInfoId) {
  return useSectionInfos((x) => {
    const { codeInfoColId } = x.variants[x.x[sectionId].variantId];
    return (
      (x.codeInfoCols[codeInfoColId]["children"][codeInfoId] ?? []).length > 0
    );
  }, _.isEqual);
}
