import { action } from "easy-peasy";
import _ from "lodash";

function getInitialState() {
  return {
    id: null,
    name: "",
    sectionConfigCol: null,
    childrenId: null,
    children: [],
  };
}

const projectConfig = {
  ...getInitialState(),

  setAll: action((state, payload) => {
    for (const k of _.keys(getInitialState())) {
      if (k in payload) {
        state[k] = payload[k];
      }
    }
  }),

  setId: action((state, payload) => {
    state.id = payload;
  }),
};

export default projectConfig;
