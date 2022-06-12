import { action } from "easy-peasy";

const mapInteraction = {
  goToCoordinates: null,

  setGoToCoordinates: action((state, payload) => {
    state.goToCoordinates = payload;
  }),
};

export default mapInteraction;
