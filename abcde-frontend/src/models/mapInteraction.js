import { action } from "easy-peasy";

const mapInteraction = {
  hovering: false,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),
};

export default mapInteraction;
