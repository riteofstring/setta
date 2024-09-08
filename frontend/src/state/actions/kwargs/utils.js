import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { findAllParameters } from "utils/getDescendants";

export function getAllSelectedParams(sectionId) {
  const codeInfoState = useCodeInfo.getState().x;
  const ids = findAllParameters(codeInfoState, [
    getSectionInfo(sectionId).codeInfoId,
  ]);
  return ids.map((x) => codeInfoState[x]).filter((x) => x.isSelected);
}
