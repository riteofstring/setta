import { useCodeInfo } from "state/definitions";
import { findAllParameters } from "utils/getDescendants";
import { getSectionCodeInfoChildren } from "../codeInfoCols";

export function getAllSelectedParams(sectionId) {
  const codeInfoState = useCodeInfo.getState().x;
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  const { ids } = findAllParameters(
    codeInfoState,
    codeInfoChildren,
    codeInfoChildren[null],
  );
  return ids.map((x) => codeInfoState[x]).filter((x) => x.isSelected);
}
