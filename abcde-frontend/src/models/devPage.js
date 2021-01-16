import { action, thunk } from "easy-peasy";
import { createUI as createUIBackend } from "../dbRequests/ui";

const devPage = {
  uiSpecs: "// write your code here",
  uiAsJson: null,
  specsAreReady: false,

  setUISpecs: action((state, payload) => {
    state.uiSpecs = payload;
  }),

  setSpecsAreReady: action((state, payload) => {
    state.specsAreReady = payload;
  }),

  setUIAsJson: action((state, payload) => {
    console.log(payload)
    state.uiAsJson = payload;
  }),

  createUI: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    action.setSpecsAreReady(false);
    const uiAsJson = await createUIBackend({
      token,
      uiSpecs: helpers.getState().uiSpecs,
    });
    if (uiAsJson){
      console.log("setting uiAsJson")
      action.setSpecsAreReady(true);
      action.setUIAsJson(JSON.parse(uiAsJson))
    }
    return uiAsJson;
  }),
};

export default devPage;
