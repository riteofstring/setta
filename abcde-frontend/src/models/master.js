import { action, thunk, debug } from "easy-peasy";
import _ from "lodash";

import { createNewId } from "utils/sectionIds";

import { createAllInfo } from "classes/infoFactory";
import Data from "data/simpleTrainTest.json";
import { parseUI } from "graphql/parsers/uiParsers";
import { createSectionInfoFn } from "hooks/useCreateInfo";

const master = {
  sectionsPerGroup: 5,
  spaceBetweenPages: 100,
  available: {},
  uiSpecs: new Map(),
  allModuleInfo: null,
  allObjCollections: null,
  allParamCollections: null,
  activeSection: null,
  groupIds: [],
  groupChildren: {},
  groupsHaveUpdated: false,

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
    action.initGroups(newIds);
  }),

  initSections: thunk((action, payload, helpers) => {
    const uiSpecs = helpers.getState().uiSpecs;
    const newIds = [];

    for (let idx = 0; idx < uiSpecs.size; idx++) {
      const newId = action.addSection({ uiSpecs, idx });
      newIds.push(newId[0]);
    }
    return newIds;
  }),

  initGroups: thunk((action, payload, helpers) => {
    const grouped = _.chunk(payload, helpers.getState().sectionsPerGroup);
    const groupIds = [];
    const groups = {};
    for (let g of grouped) {
      const groupId = createNewId();
      groupIds.push(groupId);
      groups[groupId] = g;
    }
    action.setGroupIds((x) => groupIds);
    action.setGroupChildren((x) => groups);
    action.setGroupsHaveUpdated(true);
  }),

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
  }),

  setGroupIds: action((state, payload) => {
    state.groupIds = payload(state.groupIds);
  }),

  setGroupChildren: action((state, payload) => {
    state.groupChildren = payload(state.groupChildren);
  }),

  setOneGroupChildren: action((state, payload) => {
    const { groupId, newStateFn } = payload;
    state.groupChildren[groupId] = newStateFn(state.groupChildren[groupId]);
  }),

  setGroupsHaveUpdated: action((state, payload) => {
    state.groupsHaveUpdated = payload;
  }),

  addSection: thunk((action, payload, helpers) => {
    const { uiSpecs, idx } = payload;
    const name = uiSpecs ? [...uiSpecs.keys()][idx] : "New Section";
    const state = helpers.getState();
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    const setSectionType =
      helpers.getStoreActions().sectionTypes.setSectionType;

    return createSectionInfoFn({
      name,
      numChildren: 1,
      allObjCollections: state.allObjCollections,
      allParamCollections: state.allParamCollections,
      uiSpecs,
      parentIsSection: false,
      setSectionInfo,
      setSectionType,
    });
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
