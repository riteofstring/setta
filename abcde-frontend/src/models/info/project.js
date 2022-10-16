import { action } from "easy-peasy";
import _ from "lodash";

const project = {
  id: null,
  name: "",
  configId: null,
  rootSection: null,

  setAllProjectDetails: action((state, payload) => {
    _.forEach(payload, (v, k) => (state[k] = v));
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
};

export default project;
