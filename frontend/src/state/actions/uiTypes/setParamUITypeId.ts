import { createNewId } from "utils/idNameCreation";
import { getSectionVariant, setParamEnteredValue } from "../sectionInfos";

export function setParamUITypeId({ uiTypeId, sectionId, paramInfoId, state }) {
  const s = state.sections[sectionId];
  let { uiTypeColId } = s;
  if (!uiTypeColId) {
    uiTypeColId = createNewId();
    s.uiTypeColId = uiTypeColId;
    state.uiTypeCols[uiTypeColId] = {};
  }

  if (!(paramInfoId in state.uiTypeCols[uiTypeColId])) {
    state.uiTypeCols[uiTypeColId][paramInfoId] = createUITypeColEntry({
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
    paramInfoId in values ? values[paramInfoId].value : createEVEntry().value;
  setParamEnteredValue(sectionId, paramInfoId, value, state);
}
