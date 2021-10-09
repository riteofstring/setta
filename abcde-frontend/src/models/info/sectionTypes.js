import { action } from "easy-peasy";

const sectionTypes = {
  x: {},

  setSectionType: action((state, payload) => {
    state.x = payload(state.x);
  }),
};

export default sectionTypes;
