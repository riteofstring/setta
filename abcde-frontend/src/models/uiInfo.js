import { action, thunk } from "easy-peasy";
import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
  loadUI as loadUIBackend,
  saveUI as saveUIBackend,
  saveDraftUI as saveDraftUIBackend,
} from "../dbRequests/ui";
import { getCompleteState } from "../utils/commonFunctions";

const uiInfo = {
  savedFolderAndUINames: {},

  setSavedUINames: action((state, payload) => {
    state.savedFolderAndUINames = payload;
  }),

  loadFolderAndUINames: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    const uiNames = await loadFolderAndUINamesBackend({ token });
    action.setSavedUINames(uiNames);
  }),

  loadUI: thunk(async (action, payload, helpers) => {
    const { token, uiName } = payload;
    const { rootSections: originalRootSections } = await loadUIBackend({
      token,
      uiName,
    });
    return {
      originalRootSections: JSON.parse(originalRootSections),
    };
  }),

  saveUI: thunk((action, payload, helpers) => {
    const { token, uiName, versionName } = payload;
    const originalRootSections = helpers.getStoreState().master.originalRootSections;
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
