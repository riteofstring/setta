import { action, thunk } from "easy-peasy";
import {
  loadUIAndVersionNames as loadUIAndVersionNamesBackend,
  loadUI as loadUIBackend,
  saveUI as saveUIBackend,
  saveDraftUI as saveDraftUIBackend,
} from "../dbRequests/ui";
import { getCompleteState } from "../utils/commonFunctions";

const uiInfo = {
  currUIName: "",
  currVersionName: "",
  savedUIAndVersionNames: {},

  setSavedUIAndVersionNames: action((state, payload) => {
    state.savedUIAndVersionNames = payload;
  }),

  loadUIAndVersionNames: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    const uiAndVersionNames = await loadUIAndVersionNamesBackend({ token });
    action.setSavedUIAndVersionNames(uiAndVersionNames);
  }),

  loadUI: thunk(async (action, payload, helpers) => {
    const { token, uiName, versionName } = payload;
    // ui is unused for now
    const { ui, version } = await loadUIBackend({
      token,
      uiName,
      versionName,
    });
    return version.completeState;
  }),

  saveUI: thunk((action, payload, helpers) => {
    const { token, uiName, versionName } = payload;
    const originalRootSections = helpers.getStoreState().master
      .originalRootSections;
    return saveUIBackend({
      token,
      uiName,
      versionName,
      rootSections: originalRootSections,
      statesToSave: getCompleteState(helpers.getStoreState()),
    });
  }),

  saveDraftUI: thunk((action, payload, helpers) => {
    const { token } = payload;
    return saveDraftUIBackend({
      token,
      statesToSave: getCompleteState(helpers.getStoreState()),
    });
  }),
};

export default uiInfo;
