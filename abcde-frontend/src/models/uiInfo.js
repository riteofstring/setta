import { action, thunk } from "easy-peasy";
import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
  loadUI as loadUIBackend,
  loadDraftUI as loadDraftUIBackend,
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
    const masterSetEntireState = helpers.getStoreActions().master
      .setEntireState;
    const yamlEntrySetEntireState = helpers.getStoreActions().yamlEntry
      .setEntireState;
    const factoriesInfoSetEntireState = helpers.getStoreActions().factoriesInfo
      .setEntireState;
    const funcsInfoSetEntireState = helpers.getStoreActions().funcsInfo
      .setEntireState;

    const { loadType } = payload;
    delete payload["loadType"];
    const loadFunc = loadType === "draft" ? loadDraftUIBackend : loadUIBackend;
    let data = await loadFunc(payload);
    if (data) {
      data = loadType === "draft" ? data.completeState : data.ui.completeState;
      const {
        masterState,
        yamlEntryState,
        factoriesInfoState,
        funcsInfoState,
      } = JSON.parse(data);
      masterSetEntireState(JSON.parse(masterState));
      yamlEntrySetEntireState(JSON.parse(yamlEntryState));
      factoriesInfoSetEntireState(JSON.parse(factoriesInfoState));
      funcsInfoSetEntireState(JSON.parse(funcsInfoState));
    }
  }),

  saveUI: thunk((action, payload, helpers) => {
    const { token, folderName, uiName } = payload;
    console.log("folderName, uiName", folderName, uiName);
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
