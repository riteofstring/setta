import { action } from "easy-peasy";

const uiEditor = {
  tabIndex: 0,
  setTabIndex: action((state, payload) => {
    state.tabIndex = payload;
  }),
};

export default uiEditor;
