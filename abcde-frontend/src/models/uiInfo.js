import { action, thunk } from "easy-peasy";
import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
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

  saveUI: thunk((action, payload, helpers) => {
    const { token, folderName, uiName } = payload;
    console.log("folderName, uiName", folderName, uiName)
    return saveUIBackend({
      token,
      folderName,
      uiName,
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
