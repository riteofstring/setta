import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function getInitialState() {
  return {
    id: null,
    name: "",
    ownerId: null,
    defaultConfigId: null,
  };
}

const project = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    for (const k of _.keys(getInitialState())) {
      state[k] = payload[k];
    }
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default project;
