import { action } from "easy-peasy";
import { resetState } from "./utils";

function getInitialState() {
  return {
    id: null,
  };
}

const activeSection = {
  ...getInitialState(),

  setId: action((state, payload) => {
    state.id = payload;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default activeSection;
