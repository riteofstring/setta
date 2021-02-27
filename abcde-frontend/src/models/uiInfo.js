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
    const masterState = helpers.getStoreState().master;
    const globalCurrState = helpers.getStoreState().globalCurr;
    const yamlEntryState = helpers.getStoreState().yamlEntry;
    const factoriesInfoState = helpers.getStoreState().factoriesInfo;
    const funcsInfoState = helpers.getStoreState().funcsInfo;
    return saveDraftUIBackend({
      token,
      statesToSave: {
        masterState,
        globalCurrState,
        yamlEntryState,
        factoriesInfoState,
        funcsInfoState,
      },
    });
  }),
};

export default uiInfo;
