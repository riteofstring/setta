import { createUI as createUIBackend } from "dbRequests/ui";
import { action, thunk } from "easy-peasy";
import { merge } from "lodash";
import { DEFAULT_ENTERED_TEXT } from "utils/constants";

const yaml = require("js-yaml");

const yamlEntry = {
  enteredText: [DEFAULT_ENTERED_TEXT],

  setEnteredText: action((state, payload) => {
    const { idx, text } = payload;
    state.enteredText[idx] = text;
  }),

  deleteEnteredText: action((state, payload) => {
    state.enteredText = state.enteredText.filter((x, idx) => idx !== payload);
  }),

  createUI: thunk(async (action, payload, helpers) => {
    let allYamls = helpers.getState().enteredText.map((x) => yaml.load(x));
    if (allYamls.length > 1) {
      merge(allYamls[0], ...allYamls.slice(1));
    }
    allYamls = allYamls[0];
    const cliSocket = helpers.getStoreState().cliSocket.cliSocket;
    createUIBackend({
      cliSocket,
      enteredText: allYamls,
    });
  }),
};

export default yamlEntry;
