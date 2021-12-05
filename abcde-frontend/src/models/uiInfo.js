import { action, thunk } from "easy-peasy";

import {
  loadFolderAndUINames as loadFolderAndUINamesBackend,
  loadUI as loadUIBackend,
  saveUI as saveUIBackend,
} from "../dbRequests/ui";

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
    const globalState = helpers.getStoreState();
    const sectionInfos = globalState.sectionInfos.export();
    const objInfos = globalState.objInfos.export();
    const paramInfos = globalState.paramInfos.export();
    const kwargInfos = globalState.kwargInfos.export();
    const sectionTypes = globalState.sectionTypes.export();
    const uiTypes = globalState.uiTypes.export();
    const uiTypeConfigs = globalState.uiTypeConfigs.export();

    console.log("sectionInfos", sectionInfos);
    console.log("objInfos", objInfos);
    console.log("paramInfos", paramInfos);
    console.log("kwargInfos", kwargInfos);
    console.log("sectionTypes", sectionTypes);
    console.log("uiTypes", uiTypes);
    console.log("uiTypeConfigs", uiTypeConfigs);

    // TEMPORARY
    return new Promise((resolve, reject) => resolve("temporary promise"));
    // let name = state.currUIName;
    // let folder = state.currUIFolder;
    // if (!allDefined(name, folder)) {
    //   name = "testDraft";
    //   folder = "drafts";
    // }
    // action.saveUI({ token, name, folder });
  }),
};

export default uiInfo;
