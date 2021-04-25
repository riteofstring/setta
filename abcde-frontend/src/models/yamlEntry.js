import { action, thunk } from "easy-peasy";
import { createUI as createUIBackend } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { DEFAULT_ENTERED_TEXT } from "../utils/constants";

const yamlEntry = {
  enteredText: [DEFAULT_ENTERED_TEXT],

  setEnteredText: action((state, payload) => {
    const { idx, text } = payload;
    state.enteredText[idx] = text;
  }),

  createUI: thunk(async (action, payload, helpers) => {
    const cliSocket = helpers.getStoreState().cliSocket.cliSocket;
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
