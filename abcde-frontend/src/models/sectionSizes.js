import { action, debug } from "easy-peasy";

const sectionSizes = {
  sectionSizes: {},

  setSectionSize: action((state, payload) => {
    const {sectionId, size} = payload
    state.sectionSizes[sectionId] = size;
  }),

};

export default sectionSizes;
