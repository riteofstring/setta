import { useSectionInfos } from "state/definitions";

export function addUIType(uiType) {
  useSectionInfos.setState((state) => {
    state.uiTypes[uiType.id] = uiType;
  });
}

export function setOneUITypeConfig({ uiTypeId, configName, newValueFn }) {
  useSectionInfos.setState((state) => {
    const curr = state.uiTypes[uiTypeId].config;
    curr[configName] = newValueFn(curr[configName]);
  });
}

export function deleteUIType(uiTypeId) {
  useSectionInfos.setState((state) => {
    delete state.uiTypes[uiTypeId];
  });
}
