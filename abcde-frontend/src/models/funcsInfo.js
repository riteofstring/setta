import { action } from "easy-peasy";

import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const funcsInfo = {
  funcs: {},

  setFuncs: action((state, payload) => {
    state.funcs = payload;
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default funcsInfo;
