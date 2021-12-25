import { action, thunk, debug, computed } from "easy-peasy";
import _ from "lodash";

import { createAllInfo } from "../classes/infoFactory";
import Data from "../data/simpleTrainTest.json";
import { parseUI } from "../graphql/parsers/uiParsers";
import { createSectionInfoFn } from "../hooks/useCreateInfo";
import { createNewId } from "../utils/sectionIds";

const master = {
  sectionsPerGroup: 5,
  spaceBetweenPages: 500,
  rootSectionIds: [],
  available: {},
  uiSpecs: new Map(),
  allModuleInfo: null,
  allObjCollections: null,
  allParamCollections: null,
  activeSection: null,

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    const available = {
      objects: payload.OBJECTS,
      parameters: payload.PARAMETERS,
    };
    state.uiSpecs = new Map(Object.entries(payload.UI));
    ({
      allModuleInfo: state.allModuleInfo,
      allObjCollections: state.allObjCollections,
      allParamCollections: state.allParamCollections,
    } = createAllInfo(available));

    console.log("uiSpecs", debug(state.uiSpecs));
    console.log("allModuleInfo", debug(state.allModuleInfo));
    console.log("allObjCollections", debug(state.allObjCollections));
    console.log("allParamCollections", debug(state.allParamCollections));
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
    action.initRootSectionIds({ newIds });
  }),

  initSections: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    const setChildrenInfo =
      helpers.getStoreActions().sectionInfos.setChildrenInfo;
    const setSectionType =
      helpers.getStoreActions().sectionTypes.setSectionType;

    const uiSpecs = state.uiSpecs;
    const newIds = [];

    for (let idx = 0; idx < uiSpecs.size; idx++) {
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
      newIds.push(newId[0]);
    }

    //the root "UI"
    setChildrenInfo({
      childrenInfoId: createNewId(),
      newStateFn: () => newIds,
    });

    return newIds;
  }),

  initRootSectionIds: action((state, payload) => {
    const { newIds } = payload;
    state.rootSectionIds = newIds;
  }),

  groups: computed(
    [(state) => state.rootSectionIds, (state) => state.sectionsPerGroup],
    (rootSectionIds, sectionsPerGroup) => {
      return _.chunk(rootSectionIds, sectionsPerGroup);
    }
  ),

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
    console.log("setActiveSection", payload);
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
