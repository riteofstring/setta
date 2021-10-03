import { action } from "easy-peasy";

const sectionTypes = {
  x: {},

  setSectionType: action((state, payload) => {
    const { sectionTypeId, sectionType } = payload;
    state.x[sectionTypeId] = sectionType;
  }),
};

export default sectionTypes;
