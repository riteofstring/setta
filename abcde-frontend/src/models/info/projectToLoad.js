import { action } from "easy-peasy";
import { NO_AUTH } from "utils/constants";

function getInitialState() {
  return {
    id: NO_AUTH ? "61e089c8-62bf-4e8c-915e-111b4587da81" : null,
    configId: NO_AUTH ? "439f5590-fa98-4564-8f63-ec75b6dc89b2" : null,
    isLoading: null,
  };
}

const projectToLoad = {
  ...getInitialState(),

  setProject: action((state, payload) => {
    state.id = payload.id;
    state.configId = payload.configId;
  }),

  setIsLoading: action((state, payload) => {
    state.isLoading = payload;
  }),
};

export default projectToLoad;
