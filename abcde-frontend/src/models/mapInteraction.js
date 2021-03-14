import { action } from "easy-peasy";

const mapInteraction = {
  hovering: false,
  goToHeight: null,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),

  setGoToHeight: action((state, payload) => {
    console.log("****setGoToHeight")
    state.goToHeight = payload;
  }),
};

export default mapInteraction;
