import { action } from "easy-peasy";

const mapInteraction = {
  hovering: false,
  goToCoordinates: null,
  scale: 1,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),

  setGoToCoordinates: action((state, payload) => {
    state.goToCoordinates = payload;
  }),

  setScale: action((state, payload) => {
    state.scale = payload;
  }),
};

export default mapInteraction;
