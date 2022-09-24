import { action } from "easy-peasy";

const currProject = {
  id: null,
  sectionGroup: null,

  setId: action((state, payload) => {
    state.id = payload;
  }),

  setSectionGroup: action((state, payload) => {
    state.sectionGroup = payload;
  }),
};

export default currProject;
