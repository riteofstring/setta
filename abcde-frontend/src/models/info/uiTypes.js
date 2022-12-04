import { newUIType } from "classes/uiType";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function getInitialState() {
  return { x: {} };
}

const uiTypes = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    const uiTypes = _.mapValues(payload, (v) => newUIType(v));
    actions.reset();
    actions.setAll(uiTypes);
  }),

  setAll: action((state, payload) => {
    state.x = payload;
  }),

  setUIType: action((state, payload) => {
    const { uiType } = payload;
    state.x[uiType.id] = uiType;
  }),

  setType: action((state, payload) => {
    const { uiTypeId, type } = payload;
    state.x[uiTypeId].type = type;
  }),

  setConfig: action((state, payload) => {
    const { uiTypeId, newStateFn } = payload;
    const curr = state.x[uiTypeId];
    curr.config = newStateFn(curr.config);
  }),

  setOneConfig: action((state, payload) => {
    const { uiTypeId, configName, newValueFn } = payload;
    const curr = state.x[uiTypeId].config;
    curr[configName] = newValueFn(curr[configName]);
  }),

  deleteUIType: action((state, payload) => {
    const { uiTypeId } = payload;
    delete state.x[uiTypeId];
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default uiTypes;
