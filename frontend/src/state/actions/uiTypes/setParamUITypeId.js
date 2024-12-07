import { createNewId } from "utils/idNameCreation";
import { getValueForUIType, newEVEntry } from "utils/objs/ev";
import { newUITypeColEntry } from "utils/objs/uiTypeCol";
import { getSectionVariant, setParamEnteredValue } from "../sectionInfos";

export function setParamUITypeId({ uiTypeId, sectionId, paramInfoId, state }) {
  const s = state.x[sectionId];
  let { uiTypeColId } = s;
  if (!uiTypeColId) {
    uiTypeColId = createNewId();
    s.uiTypeColId = uiTypeColId;
    state.uiTypeCols[uiTypeColId] = {};
  }

  if (!(paramInfoId in state.uiTypeCols[uiTypeColId])) {
    state.uiTypeCols[uiTypeColId][paramInfoId] = newUITypeColEntry({
      uiTypeId,
    });
  } else {
    state.uiTypeCols[uiTypeColId][paramInfoId].uiTypeId = uiTypeId;
  }

  convertValue(sectionId, paramInfoId, uiTypeId, state);
}

function convertValue(sectionId, paramInfoId, uiTypeId, state) {
  const uiType = state.uiTypes[uiTypeId];
  const values = getSectionVariant(sectionId, state).values;
  const currValue =
    paramInfoId in values ? values[paramInfoId].value : newEVEntry().value;
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue(sectionId, paramInfoId, value, state);
}
