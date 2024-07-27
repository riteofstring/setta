import { useUITypes } from "state/definitions/uiTypes";

export function setAllUITypes(payload) {
  useUITypes.setState({ x: payload });
}

export function addUIType({ uiType }) {
  useUITypes.setState((state) => {
    state.x[uiType.id] = uiType;
  });
}

export function setOneUITypeConfig({ uiTypeId, configName, newValueFn }) {
  useUITypes.setState((state) => {
    const curr = state.x[uiTypeId].config;
    curr[configName] = newValueFn(curr[configName]);
  });
}

export function deleteUIType({ uiTypeId }) {
  useUITypes.setState((state) => {
    delete state.x[uiTypeId];
  });
}

export function updateUITypes(payload) {
  useUITypes.setState((state) => {
    state.x = { ...state.x, ...payload };
  });
}
