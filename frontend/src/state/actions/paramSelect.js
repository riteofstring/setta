import { useMisc } from "../definitions";
import { toggleParamSelected } from "./kwargs";

export function activateParamSelect() {
  useMisc.setState({ isSelectingParams: true });
}

export function deactivateParamSelect() {
  useMisc.setState({ isSelectingParams: false });
}

export function getOnMouseDownSelectParamFn(
  ancestorIsSelected,
  sectionId,
  paramInfoId,
) {
  return (e) => {
    console.log("onMouseDownSelect", sectionId, paramInfoId);
    if (!ancestorIsSelected && useMisc.getState().isSelectingParams) {
      e.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    }
  };
}
