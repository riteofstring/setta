import { getValueForUIType } from "utils/objs/ev";
import {
  getSectionVariant,
  initUITypeColEntry,
  setParamEnteredValue,
} from "../sectionInfos";

export function setParamUITypeId({ uiTypeId, sectionId, paramInfoId, state }) {
  const { uiTypeColId } = state.x[sectionId];
  if (!(paramInfoId in state.uiTypeCols[uiTypeColId])) {
    state.uiTypeCols[uiTypeColId][paramInfoId] = initUITypeColEntry(uiTypeId);
  } else {
    state.uiTypeCols[uiTypeColId][paramInfoId].uiTypeId = uiTypeId;
  }

  convertValue(sectionId, paramInfoId, uiTypeId, state);
}

function convertValue(sectionId, paramInfoId, uiTypeId, state) {
  const uiType = state.uiTypes[uiTypeId];
  const currValue = getSectionVariant(sectionId, state).values[paramInfoId]
    .value;
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue(sectionId, paramInfoId, value, state);
}
