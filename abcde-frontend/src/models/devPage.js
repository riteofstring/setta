import { action } from "easy-peasy";
import { createUI as createUIBackend } from "../dbRequests/ui";

const devPage = {
  uiSpecs: "// write your code here",
  specsAreReady: false,

  setUISpecs: action((state, payload) => {
    state.uiSpecs = payload;
  }),

  setSpecsAreReady: action((state, payload) => {
    state.specsAreReady = payload;
  }),

  createUI: action((state, payload) => {
    const { token } = payload;
    state.specsAreReady = false;
    createUIBackend({ token, uiSpecs: state.uiSpecs });
  }),
};

export default devPage;
