import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

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

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    for (const k of _.keys(getInitialState())) {
      state[k] = payload[k];
    }
  }),

  addChildren: action((state, payload) => {
    state.children = _.uniq([...state.children, ...payload]);
  }),

  deleteChildren: action((state, payload) => {
    state.children = state.children.filter((x) => {
      return !payload.includes(x);
    });
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default projectConfig;
