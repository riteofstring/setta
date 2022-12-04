import { action } from "easy-peasy";
import { resetState } from "models/utils";

function getInitialState() {
  return {
    tabIndex: 0,
    cameFromUIConfig: false,
  };
}

const uiEditor = {
  ...getInitialState(),

  setTabIndex: action((state, payload) => {
    state.tabIndex = payload;
  }),
  setCameFromUIConfig: action((state, payload) => {
    state.cameFromUIConfig = payload;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default uiEditor;
