import { action } from "easy-peasy";

const mapInteraction = {
  hovering: false,
  goToHeight: null,
  scale: 1,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),

  setGoToHeight: action((state, payload) => {
    state.goToHeight = payload;
  }),

  setScale: action((state, payload) => {
    state.scale = payload;
  }),
};

export default mapInteraction;
