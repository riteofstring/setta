import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
  loadUI as loadUIBackend,
  saveUI as saveUIBackend,
} from "dbRequests/ui";
import { action, thunk } from "easy-peasy";
import { allDefined } from "utils/utils";

import { exportAllStates } from "./info/utils";

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
    console.log("loadUI", payload);
    const ui = await loadUIBackend(payload);
    helpers.getStoreActions().master.setEntireState(ui);
    // const masterSetEntireState =
    //   helpers.getStoreActions().master.setEntireState;
    // const yamlEntrySetEntireState =
    //   helpers.getStoreActions().yamlEntry.setEntireState;
    // const factoriesInfoSetEntireState =
    //   helpers.getStoreActions().factoriesInfo.setEntireState;
    // const funcsInfoSetEntireState =
    //   helpers.getStoreActions().funcsInfo.setEntireState;

    // const { loadType } = payload;
    // delete payload["loadType"];
    // const loadFunc = loadType === "draft" ? loadDraftUIBackend : loadUIBackend;
    // let data = await loadFunc(payload);
    // if (data) {
    //   data = loadType === "draft" ? data.completeState : data.ui.completeState;
    //   const {
    //     masterState,
    //     yamlEntryState,
    //     factoriesInfoState,
    //     funcsInfoState,
    //   } = JSON.parse(data);
    //   masterSetEntireState(JSON.parse(masterState));
    //   yamlEntrySetEntireState(JSON.parse(yamlEntryState));
    //   factoriesInfoSetEntireState(JSON.parse(factoriesInfoState));
    //   funcsInfoSetEntireState(JSON.parse(funcsInfoState));
    // }
  }),

  saveUI: thunk((action, payload, helpers) => {
    const { token, name, folder } = payload;
    const globalState = helpers.getStoreState();
    const ui = exportAllStates(globalState);
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
    return action.saveUI({ token, name, folder });

    // TEMPORARY
    // return new Promise((resolve, reject) => resolve("temporary promise"));
  }),
};

export default uiInfo;
