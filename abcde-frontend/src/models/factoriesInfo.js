import { action } from "easy-peasy";

import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const factoriesInfo = {
  factories: {},

  setFactories: action((state, payload) => {
    state.factories = payload;
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default factoriesInfo;
