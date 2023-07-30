import { getValueForUIType } from "abcde-utils/src/objs/ev";
import { useUITypes } from "models/info/uiTypes";
import { getParamEV, setParamEnteredValue } from "thunks/paramInfos";

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}
