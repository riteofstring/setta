import { useUITypes } from "state/definitions/uiTypes";
import { getParamEV, setParamEnteredValue } from "state/actions/paramInfos";
import { getValueForUIType } from "z_utils/objs/ev";

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}
