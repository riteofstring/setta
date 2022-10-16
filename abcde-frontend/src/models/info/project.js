import { action } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function getInitialState() {
  return {
    id: null,
    name: "",
    configId: null,
    sectionConfigColId: null,
    rootSection: null,
  };
}

const project = {
  ...getInitialState(),

  setAllProjectDetails: action((state, payload) => {
    for (const k of _.keys(getInitialState())) {
      if (k in payload) {
        state[k] = payload[k];
      }
    }
  }),

  setId: action((state, payload) => {
    state.id = payload;
  }),

  setName: action((state, payload) => {
    state.name = payload;
  }),

  setConfigId: action((state, payload) => {
    state.configId = payload;
  }),

  setRootSection: action((state, payload) => {
    state.rootSection = payload;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default project;
