import { action, thunk } from "easy-peasy";
import { createUI as createUIBackend } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const yamlEntry = {
  enteredText: "// write your code here",

  setEnteredText: action((state, payload) => {
    state.enteredText = payload;
  }),

  createUI: thunk(async (action, payload, helpers) => {
    const cliSocket = helpers.getStoreState().cliSocket.cliSocket
    createUIBackend({
      cliSocket,
      enteredText: helpers.getState().enteredText,
    });
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default yamlEntry;
