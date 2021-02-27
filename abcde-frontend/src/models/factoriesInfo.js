import { action } from "easy-peasy";

const factoriesInfo = {
  factories: {},

  setFactories: action((state, payload) => {
    state.factories = payload
  }),
};

export default factoriesInfo