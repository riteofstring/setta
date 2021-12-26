import { action, computed } from "easy-peasy";

const mapInteraction = {
  hovering: false,
  goToCoordinates: null,
  currScale: 1,

  setHovering: action((state, payload) => {
    state.hovering = payload;
  }),

  setGoToCoordinates: action((state, payload) => {
    state.goToCoordinates = payload;
  }),

  setCurrScale: action((state, payload) => {
    state.currScale = payload;
  }),

  currScaleAdjusted: computed(
    [(state) => state.currScale],
    (currScale) => currScale ** 0.5
  ),
};

export default mapInteraction;
