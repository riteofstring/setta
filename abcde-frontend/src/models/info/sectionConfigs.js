import { newSectionConfig } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function getInitialState() {
  return { x: {} };
}

const sectionConfigs = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    const sectionConfigInfos = _.mapValues(payload, (x) => newSectionConfig(x));
    actions.reset();
    actions.setAll(sectionConfigInfos);
  }),

  setAll: action((state, payload) => {
    state.x = payload;
  }),

  setSectionConfig: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionConfigAttr: action((state, payload) => {
    const { configId, attr, value } = payload;
    state.x[configId][attr] = value;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionConfigs;
