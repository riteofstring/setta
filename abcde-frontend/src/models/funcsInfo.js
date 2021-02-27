import { action } from "easy-peasy";

const funcsInfo = {
  funcs: {},

  setFuncs: action((state, payload) => {
    state.funcs = payload
  }),
};

export default funcsInfo