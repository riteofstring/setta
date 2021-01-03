import { action, thunk } from "easy-peasy";
import { loadUINames as loadUINamesBackend } from "../dbRequests/ui";

const uiInfo = {
  uiNames: [],

  setUINames: action((state, payload) => {
      console.log("setUINames", payload)
    state.uiNames = payload;
  }),

  loadUINames: thunk((action, payload, helpers) => {
    const { token } = payload;
    loadUINamesBackend({ token }).then((uiNames) => action.setUINames(uiNames));
  }),
};

export default uiInfo;
