import { action } from "easy-peasy";
import { resetState } from "./utils";

function getInitialState() {
  return {
    id: null,
    mouseOffset: { id: null, x: null, y: null },
  };
}

const activeSection = {
  ...getInitialState(),

  setId: action((state, payload) => {
    state.id = payload;
  }),

  setMouseOffset: action((state, payload) => {
    const {
      e: { clientX, clientY },
      node: {
        id,
        position: { x, y },
      },
    } = payload;
    console.log(payload)
    state.mouseOffset = { id, x: clientX - x, y: clientY - y };
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default activeSection;
