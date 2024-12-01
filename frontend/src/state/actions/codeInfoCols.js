import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function getSectionCodeInfoChildren(sectionId) {
  return useSectionInfos.getState().codeInfoCols[
    getSectionCodeInfoColId(sectionId)
  ].children;
}

export function getCodeInfoChildren(sectionId, codeInfoId) {
  return getSectionCodeInfoChildren(sectionId)[codeInfoId];
}

export function duplicateCodeInfoCol(id, state) {
  const newId = createNewId();
  const s = state.codeInfoCols;
  s[newId] = _.cloneDeep(s[id]);
  return newId;
}
