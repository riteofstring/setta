import { action } from "easy-peasy";

const reactFlow = {
  instance: null,

  setInstance: action((state, payload) => {
    state.instance = payload;
  }),
};

export default reactFlow;
