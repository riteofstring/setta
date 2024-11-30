import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { getSectionInfo } from "../../getters/sectionInfo";

export function setManyParamUITypeIds({ collectionId, paramIdToUITypeId }) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[collectionId] = {
      ...state.uiTypeCols[collectionId],
      ...paramIdToUITypeId,
    };
  });
}

export function setNonPresetUITypeIds({
  collectionId,
  paramInfoId,
  newValueFn,
}) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[collectionId][paramInfoId].nonPresetUITypeIds = newValueFn(
      state.uiTypeCols[collectionId][paramInfoId].nonPresetUITypeIds,
    );
  });
}

export function deleteParamInfoFromUITypeCol({ uiTypeColId, ids }) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[uiTypeColId] = _.omit(state.uiTypeCols[uiTypeColId], ids);
  });
}

function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useSectionInfos.getState().uiTypeCols[uiTypeColId];
  if (
    paramInfoId.startsWith(C.JSON_SOURCE_PREFIX) &&
    !(paramInfoId in uiTypeCol)
  ) {
    return BASE_UI_TYPE_IDS[C.TEXT];
  }
  return uiTypeCol[paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useSectionInfos.getState().uiTypes[uiTypeId];
}
