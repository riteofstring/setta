import { action, thunk, debug } from "easy-peasy";
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
  groupIds: [],

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
    action.initRootSectionIds(newIds);
    action.initGroups(newIds);
  }),

  initSections: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
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
    return newIds;
  }),

  initRootSectionIds: action((state, payload) => {
    state.rootSectionIds = payload;
  }),

  initGroups: thunk((action, payload, helpers) => {
    const setChildrenInfo =
      helpers.getStoreActions().sectionInfos.setChildrenInfo;
    const grouped = _.chunk(payload, helpers.getState().sectionsPerGroup);
    for (let g of grouped) {
      const childrenInfoId = createNewId();
      helpers.getState().groupIds.push(childrenInfoId);
      setChildrenInfo({
        childrenInfoId,
        newStateFn: () => g,
      });
    }
  }),

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
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
