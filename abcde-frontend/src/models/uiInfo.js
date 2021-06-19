import { action, thunk } from "easy-peasy";
import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
  loadUI as loadUIBackend,
  loadDraftUI as loadDraftUIBackend,
  saveUI as saveUIBackend,
  saveDraftUI as saveDraftUIBackend,
} from "../dbRequests/ui";
import { getCompleteState } from "../utils/commonFunctions";
import { allDefined } from "../utils/utils";

const uiInfo = {
  currUIName: null,
  currUIFolder: null,

  loadedFolderAndUINames: {},

  setLoadedFolderAndUINames: action((state, payload) => {
    const newState = {};
    for (let i = 0; i < payload.length; i++) {
      newState[payload[i].name] = payload[i].uis.map((e) => e.name);
    }
    state.loadedFolderAndUINames = newState;
  }),

  loadFolderAndUINames: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    const uiNames = await loadFolderAndUINamesBackend({ token });
    action.setLoadedFolderAndUINames(uiNames);
  }),

  loadUI: thunk(async (action, payload, helpers) => {
    const masterSetEntireState =
      helpers.getStoreActions().master.setEntireState;
    const yamlEntrySetEntireState =
      helpers.getStoreActions().yamlEntry.setEntireState;
    const factoriesInfoSetEntireState =
      helpers.getStoreActions().factoriesInfo.setEntireState;
    const funcsInfoSetEntireState =
      helpers.getStoreActions().funcsInfo.setEntireState;

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
    const { token, name, folder } = payload;
    const ui = helpers.getStoreActions().master.exportSaveableInfo();
    return saveUIBackend({
      token,
      name,
      folder,
      ui,
    });
  }),

  saveDraftUI: thunk((action, payload, helpers) => {
    const { token } = payload;
    const state = helpers.getState();
    let name = state.currUIName;
    let folder = state.currUIFolder;
    if (!allDefined(name, folder)) {
      name = "testDraft";
      folder = "drafts";
    }
    action.saveUI({ token, name, folder });
  }),
};

export default uiInfo;
