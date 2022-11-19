import { action } from "easy-peasy";
import _ from "lodash";

function getInitialState() {
  return {
    id: null,
    name: "",
    ownerId: null,
    defaultConfig: null,
  };
}

const project = {
  ...getInitialState(),

  setAll: action((state, payload) => {
    for (const k of _.keys(getInitialState())) {
      if (k in payload) {
        state[k] = payload[k];
      }
    }
  }),

  setId: action((state, payload) => {
    state.id = payload;
  }),
};

export default project;
