import { action } from "easy-peasy";

const currProject = {
  id: null,

  setId: action((state, payload) => {
    state.id = payload;
  }),
};

export default currProject;
