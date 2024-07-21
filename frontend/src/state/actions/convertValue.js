import { getParamEV, setParamEnteredValue } from "state/actions/paramInfos";
import { useUITypes } from "state/definitions";
import { getValueForUIType } from "utils/objs/ev";

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}
