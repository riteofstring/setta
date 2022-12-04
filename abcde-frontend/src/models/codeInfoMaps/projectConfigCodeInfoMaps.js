import { action, thunk } from "easy-peasy";
import { resetState } from "models/utils";
import { getInitialState, setAll } from "./utils";

const projectConfigCodeInfoMaps = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    setAll(state, payload);
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default projectConfigCodeInfoMaps;
