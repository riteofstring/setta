import { action } from "easy-peasy";

const uiEditor = {
  tabIndex: 0,
  cameFromUIConfig: false,

  setTabIndex: action((state, payload) => {
    state.tabIndex = payload;
  }),
  setCameFromUIConfig: action((state, payload) => {
    state.cameFromUIConfig = payload;
  }),
};

export default uiEditor;
