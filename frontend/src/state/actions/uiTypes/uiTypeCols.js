import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getUITypeColAttr } from "state/hooks/uiTypes";

export function deleteParamInfoFromUITypeCol(uiTypeColId, ids, state) {
  state.uiTypeCols[uiTypeColId] = _.omit(state.uiTypeCols[uiTypeColId], ids);
}

export function getParamUIType(sectionId, paramInfoId, _state) {
  const state = _state ?? useSectionInfos.getState();
  const uiTypeId = getUITypeColAttr(sectionId, paramInfoId, "uiTypeId", state);
  return state.uiTypes[uiTypeId];
}
