import { action, thunk } from "easy-peasy";
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

  createUI: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    action.setSpecsAreReady(false);
    const result = await createUIBackend({
      token,
      uiSpecs: helpers.getState().uiSpecs,
    });
    if (result === "success"){
      action.setSpecsAreReady(true);
    }
    return result;
  }),
};

export default devPage;
