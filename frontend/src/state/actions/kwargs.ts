import { useProjectState } from "state/definitions";
import { setCurrEffectiveSectionImplValue } from "./sectionInfos";

export function toggleParamSelected(sectionId, paramInfoId) {
  useProjectState.setState((x) => {
    setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(x, sectionId, {
      selectedParams: (curr) => {
        if (curr?.includes(paramInfoId)) {
          return curr.filter((x) => x != paramInfoId);
        }
        return [...curr, paramInfoId];
      },
    });
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
