import {
  newMutableParamUITypeInfo,
  newParamTypeInfo,
} from "classes/mutableInfo";
import _ from "lodash";

export function setCodeInfoMap(state, paramInfoId) {
  if (!(paramInfoId in state.codeInfoMaps)) {
    state.codeInfoMaps[paramInfoId] = newMutableParamUITypeInfo({
      id: paramInfoId,
    });
  }
  return state.codeInfoMaps[paramInfoId];
}

export function setCodeInfoTypeMap(state, type) {
  if (!(type in state.codeInfoTypeMaps)) {
    state.codeInfoTypeMaps[type] = newParamTypeInfo({ type });
  }
  return state.codeInfoTypeMaps[type];
}

export function getInitialState() {
  return { codeInfoMaps: {}, codeInfoTypeMaps: {} };
}

export function setAll(state, payload) {
  const { codeInfoMaps, codeInfoTypeMaps } = payload;

  _.forEach(
    codeInfoMaps,
    (v, k) => (setCodeInfoMap(state, k).uiTypeId = v.uiTypeId)
  );

  _.forEach(
    codeInfoTypeMaps,
    (v, k) => (setCodeInfoTypeMap(state, k).uiTypeId = v.uiTypeId)
  );
}
