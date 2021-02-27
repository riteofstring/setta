import { action, thunk } from "easy-peasy";
import {
  loadUINames as loadUINamesBackend,
  loadUI as loadUIBackend,
} from "../dbRequests/ui";

const uiInfo = {
  uiNames: [],

  setUINames: action((state, payload) => {
    state.uiNames = payload;
  }),

  loadUINames: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    const uiNames = await loadUINamesBackend({ token });
    action.setUINames(uiNames);
  }),

  loadUI: thunk(async (action, payload, helpers) => {
    const { token, uiName } = payload;
    const { sections, selections, globalCurr } = await loadUIBackend({
      token,
      uiName,
    });
    return {
      sections: JSON.parse(sections),
      selections: JSON.parse(selections),
      globalCurr: JSON.parse(globalCurr),
    };
  }),
};

export default uiInfo;
