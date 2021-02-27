import { action, thunk } from "easy-peasy";
import {
  loadUINames as loadUINamesBackend,
  loadUI as loadUIBackend,
  saveDraftUI as saveDraftUIBackend,
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
    const { sections, selected, globalCurr } = await loadUIBackend({
      token,
      uiName,
    });
    return {
      sections: JSON.parse(sections),
      selected: JSON.parse(selected),
      globalCurr: JSON.parse(globalCurr),
    };
  }),

  saveDraftUI: thunk((action, payload, helpers) => {
    const { token } = payload;
    const { sections, selected } = helpers.getStoreState().master;
    const { globalCurr } = helpers.getStoreState().globalCurr;
    saveDraftUIBackend({ token, sections, selected, globalCurr });
  }),
};

export default uiInfo;
