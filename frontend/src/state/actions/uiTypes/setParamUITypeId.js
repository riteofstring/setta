import { getValueForUIType } from "utils/objs/ev";
import { getParamEV, setParamEnteredValue } from "../sectionVariants";

export function setParamUITypeId({ uiTypeId, sectionId, paramInfoId, state }) {
  const { uiTypeColId } = state.x[sectionId];
  if (!(paramInfoId in state.uiTypeCols[uiTypeColId])) {
    state.uiTypeCols[uiTypeColId][paramInfoId] = {
      uiTypeId,
      nonPresetUITypeIds: [],
    };
  } else {
    state.uiTypeCols[uiTypeColId][paramInfoId].uiTypeId = uiTypeId;
  }

  convertValue(sectionId, paramInfoId, uiTypeId, state);
}

function convertValue(sectionId, paramInfoId, uiTypeId, state) {
  const uiType = state.uiTypes[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId, state);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue(sectionId, paramInfoId, value, state);
}
