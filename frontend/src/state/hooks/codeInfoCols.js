import _ from "lodash";
import { useCodeInfoCols } from "state/definitions";
import { useSectionCodeInfoColId } from "./sectionVariants";

export function useSectionCodeInfoChildren(sectionId) {
  const codeInfoColId = useSectionCodeInfoColId(sectionId);
  return useCodeInfoCols((x) => x.x[codeInfoColId]["children"]);
}

export function useCodeInfoChildren(sectionId, codeInfoId) {
  const codeInfoColId = useSectionCodeInfoColId(sectionId);
  return useCodeInfoCols(
    (x) => x.x[codeInfoColId]["children"][codeInfoId] ?? [],
    _.isEqual,
  );
}

export function useCodeInfoHasChildren(sectionId, codeInfoId) {
  const codeInfoColId = useSectionCodeInfoColId(sectionId);
  return useCodeInfoCols(
    (x) => (x.x[codeInfoColId]["children"][codeInfoId] ?? []).length > 0,
    _.isEqual,
  );
}
