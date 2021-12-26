import { action } from "easy-peasy";

const mapInteraction = {
  hovering: false,
  goToCoordinates: null,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),

  setGoToCoordinates: action((state, payload) => {
    state.goToCoordinates = payload;
  }),
};

export default mapInteraction;
