import { action, thunk } from "easy-peasy";
import { createUI as createUIBackend } from "../dbRequests/ui";

const yamlEntry = {
  enteredText: "// write your code here",

  setEnteredText: action((state, payload) => {
    state.enteredText = payload;
  }),

  createUI: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    return await createUIBackend({
      token,
      enteredText: helpers.getState().enteredText,
    });
  }),
};

export default yamlEntry;
