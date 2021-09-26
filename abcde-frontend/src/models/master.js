import { action, thunk } from "easy-peasy";

import Data from "../data/simpleTrainTest.json";
import { parseUI } from "../graphql/parsers/uiParsers";
import { getPageMinMaxList } from "../utils/sectionIds";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  pageMinMaxList: [],
  available: {},
  uiSpecs: new Map(),

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    state.available = {
      objects: payload.OBJECTS,
      parameters: payload.PARAMETERS,
    };
    state.uiSpecs = new Map(Object.entries(payload.UI));
    // for (let key of Object.keys(payload.UI)) {
    //   const currSectionInfo = payload.UI[key];
    //   const newSection = new Section(
    //     key,
    //     new SectionInfo(key, currSectionInfo, state.sections.available),
    //     0
    //   );
    //   state.sections.addSection(newSection, currSectionInfo.id);
    //   parseEnteredValues(state.sections, currSectionInfo);
    //   parseUITypes(state.sections, currSectionInfo);
    //   parseSelected(state.sections, currSectionInfo);
    //   parseChildren(state.sections, currSectionInfo);
    // }
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
  }),

  // // Show/Collapse button
  // setChildrenAreCollapsed: action((state, payload) => {
  //   state.sections.setChildrenAreCollapsed(payload);
  // }),

  // // stores what fields to show
  // setSelected: action((state, payload) => {
  //   state.sections.setSelected(payload);
  // }),

  // setChildrenIds: action((state, payload) => {
  //   state.sections.setChildrenIds(payload);
  // }),

  // setEnteredValue: action((state, payload) => {
  //   state.sections.setEnteredValue(payload);
  // }),

  // setParamUIType: action((state, payload) => {
  //   state.sections.setParamUIType(payload);
  // }),

  // setUIType: action((state, payload) => {
  //   state.sections.setUIType(payload);
  // }),

  // setChildrenIdsPerParam: action((state, payload) => {
  //   state.sections.setChildrenIdsPerParam(payload);
  // }),

  // setParamUITypeConfig: action((state, payload) => {
  //   state.sections.setParamUITypeConfig(payload);
  // }),

  // setSectionModules: action((state, payload) => {
  //   state.sections.setSectionModules(payload);
  // }),

  // setName: action((state, payload) => {
  //   state.sections.setName(payload);
  // }),

  // addChildren: thunk((action, payload, helpers) => {
  //   return helpers.getState().sections.createAndAddChildren(payload);
  // }),

  // deleteSections: action((state, payload) => {
  //   state.sections.deleteSections(payload);
  // }),

  // deleteChildren: action((state, payload) => {
  //   state.sections.deleteChildren(payload);
  // }),

  // addKwarg: action((state, payload) => {
  //   state.sections.addKwarg(payload);
  // }),

  // deleteKwarg: action((state, payload) => {
  //   state.sections.deleteKwarg(payload);
  // }),

  // replaceKwarg: action((state, payload) => {
  //   state.sections.replaceKwarg(payload);
  // }),

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
