import { action } from "easy-peasy";

import { ipcRenderer } from "../utils/constants";

const devPage = {
  uiSpecs: "// write your code here",
  specsAreReady: false,

  setUISpecs: action((state, payload) => {
    state.uiSpecs = payload;
  }),

  setSpecsAreReady: action((state, payload) => {
    state.specsAreReady = payload;
  }),

  createUI: action((state) => {
    state.specsAreReady = false
    ipcRenderer.send("asynchronous-message", {
      arg: "create UI",
      data: state.uiSpecs,
    });
  }),
};

export default devPage;
