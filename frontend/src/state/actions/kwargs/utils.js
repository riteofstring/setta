import { findAllParameters } from "utils/getDescendants";

export function getAllSelectedParams(sectionId, state) {
  const codeInfoState = state.codeInfo;
  const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
  const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
  const { ids } = findAllParameters(
    codeInfoState,
    codeInfoChildren,
    codeInfoChildren[null],
  );
  return ids.map((x) => codeInfoState[x]).filter((x) => x.isSelected);
}
