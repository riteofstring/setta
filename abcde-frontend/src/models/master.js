import { action, thunk, debug } from "easy-peasy";

import { createAllInfo } from "../classes/infoFactory";
import Data from "../data/simpleTrainTest.json";
import { parseUI } from "../graphql/parsers/uiParsers";
import { createSectionInfoFn } from "../hooks/useCreateInfo";
import { getPageMinMaxList } from "../utils/sectionIds";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  pageMinMaxList: [],
  groups: [],
  available: {},
  uiSpecs: new Map(),
  allModuleInfo: null,
  allObjCollections: null,
  allParamCollections: null,

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    state.available = {
      objects: payload.OBJECTS,
      parameters: payload.PARAMETERS,
    };
    state.uiSpecs = new Map(Object.entries(payload.UI));
    ({
      allModuleInfo: state.allModuleInfo,
      allObjCollections: state.allObjCollections,
      allParamCollections: state.allParamCollections,
    } = createAllInfo(state.available));

    console.log("available", debug(state.available));
    console.log("uiSpecs", debug(state.uiSpecs));
    console.log("allModuleInfo", debug(state.allModuleInfo));
    console.log("allObjCollections", debug(state.allObjCollections));
    console.log("allParamCollections", debug(state.allParamCollections));

    state.pageMinMaxList = getPageMinMaxList(
      state.uiSpecs.size,
      state.sectionsPerPage
    );
  }),

  setEntireState: thunk((action, payload, helpers) => {
    console.log("payload", payload);
    action._loadSections(parseUI(payload));
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (true) {
      action._loadSections(Data.ENTIRE_UI);
    } else {
      // action._loadSections(payload);
    }
    const newIds = action.initSections();
    action.initGroups({ newIds });
  }),

  initSections: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    const setSectionType =
      helpers.getStoreActions().sectionTypes.setSectionType;

    const uiSpecs = state.uiSpecs;
    const numGroups = Math.ceil(uiSpecs.size / state.sectionsPerPage);
    const newIds = [];

    for (let g = 0; g < numGroups; g++) {
      const { minIdx, maxIdx } = state.pageMinMaxList[g];
      newIds[g] = [];
      for (
        let idx = minIdx;
        idx < Math.min(maxIdx, state.uiSpecs.size);
        idx++
      ) {
        const newId = createSectionInfoFn({
          name: [...uiSpecs.keys()][idx],
          numChildren: 1,
          allObjCollections: state.allObjCollections,
          allParamCollections: state.allParamCollections,
          uiSpecs,
          parentIsSection: false,
          setSectionInfo,
          setSectionType,
        });
        newIds[g].push(newId[0]);
      }
    }
    return newIds;
  }),

  initGroups: action((state, payload) => {
    const { newIds } = payload;
    state.groups = newIds;
  }),

  // exportSelected: thunk((action, payload, helpers) => {
  //   return createExportableObject(helpers.getState().sections);
  // }),

  // exportSaveableInfo: thunk((action, payload, helpers) => {
  //   const state = helpers.getState();
  //   const sections = state.sections;
  //   return sections.exportSaveableInfo();
  // }),

  // runSelected: thunk(async (action, payload, helpers) => {
  //   const { selected } = payload;
  //   generateAndRunCode({
  //     cliSocket: helpers.getStoreState().cliSocket.cliSocket,
  //     SELECTED: selected,
  //     FACTORIES: helpers.getStoreState().factoriesInfo.factories,
  //     FUNCS: helpers.getStoreState().funcsInfo.funcs,
  //   });
  // }),
};

export default master;
