import { action } from "easy-peasy";

function getInitialState() {
  return {
    id: null,
    configId: null,
  };
}

const projectToLoad = {
  ...getInitialState(),

  setProject: action((state, payload) => {
    state.id = payload.id;
    state.configId = payload.configId;
  }),
};

export default projectToLoad;
