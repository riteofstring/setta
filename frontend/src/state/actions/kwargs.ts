import { useProjectState } from "state/definitions";
import { getCodeInfoCol } from "./sectionInfos";

export function toggleParamSelected(sectionId, paramInfoId) {
  useProjectState.setState((x) => {
    const codeInfoChildren = getCodeInfoCol(sectionId, x).children;
    setAttrOfSelfAndDescendants(
      x.codeInfo,
      codeInfoChildren,
      paramInfoId,
      "isSelected",
      !x.codeInfo[paramInfoId].isSelected,
    );
  });
}

export function unselectAllParams() {
  let didUnselectSomeParams = false;
  useProjectState.setState((x) => {
    for (const codeInfo of Object.values(x.codeInfo)) {
      if (codeInfo.isSelected) {
        codeInfo.isSelected = false;
        didUnselectSomeParams = true;
      }
    }
  });
  return didUnselectSomeParams;
}

function setAttrOfSelfAndDescendants(state, codeInfoChildren, id, attr, value) {
  state[id][attr] = value;
  for (const paramId of codeInfoChildren[id]) {
    state[paramId][attr] = value;
    setAttrOfSelfAndDescendants(state, codeInfoChildren, paramId, attr, value);
  }
}
