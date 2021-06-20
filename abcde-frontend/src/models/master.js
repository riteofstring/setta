import { action, thunk, debug } from "easy-peasy";
import Data from "../data/simpleTrainTest.json";
import { SectionInfo } from "../classes/jsonParser";
import { Section } from "../classes/section";
import { Sections } from "../classes/sections";
import { NO_AUTH } from "../utils/constants";
import { generateAndRunCode } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { getPageMinMaxList, createExportableObject } from "../utils/sectionIds";
import {
  parseAvailableObjects,
  parseAvailableParameters,
  parseSectionPositions,
  parseSections,
} from "../graphql/parsers/uiParsers";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  pageMinMaxList: [],
  sections: new Sections(),

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    state.sections = new Sections();
    state.sections.available = {
      objects: payload.OBJECTS,
      parameters: payload.PARAMETERS,
    };
    for (let key of Object.keys(payload.UI)) {
      console.log("key", key);
      state.sections.addSection(
        new Section(
          key,
          new SectionInfo(key, payload.UI[key], state.sections.available),
          0
        )
      );
    }
    state.pageMinMaxList = getPageMinMaxList(
      state.sections.numRootIds(),
      state.sectionsPerPage
    );
  }),

  setEntireState: thunk((action, payload, helpers) => {
    console.log("payload", payload);
    const entireUI = {};
    entireUI["OBJECTS"] = parseAvailableObjects(payload["availableObjects"]);
    entireUI["PARAMETERS"] = parseAvailableParameters(
      payload["availableParameters"]
    );
    entireUI["UI"] = parseSections(payload["sections"], payload["sectionPositions"]);
    action._loadSections(entireUI);
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (true) {
      action._loadSections(Data.ENTIRE_UI);
    } else {
      // action._loadSections(payload);
    }
  }),

  // Show/Collapse button
  setChildrenAreCollapsed: action((state, payload) => {
    state.sections.setChildrenAreCollapsed({ ...payload });
  }),

  // stores what fields to show
  setSelected: action((state, payload) => {
    state.sections.setSelected({ ...payload });
  }),

  setChildrenIds: action((state, payload) => {
    state.sections.setChildrenIds({ ...payload });
  }),

  setEnteredValue: action((state, payload) => {
    state.sections.setEnteredValue({ ...payload });
  }),

  setParamUIType: action((state, payload) => {
    state.sections.setParamUIType({ ...payload });
  }),

  setUIType: action((state, payload) => {
    state.sections.setUIType({ ...payload });
  }),

  setChildrenIdsPerParam: action((state, payload) => {
    state.sections.setChildrenIdsPerParam({ ...payload });
  }),

  setParamUITypeConfig: action((state, payload) => {
    state.sections.setParamUITypeConfig({ ...payload });
  }),

  setSectionModules: action((state, payload) => {
    state.sections.setSectionModules({ ...payload });
  }),

  setName: action((state, payload) => {
    state.sections.setName({ ...payload });
  }),

  addChildren: thunk((actiona, payload, helpers) => {
    const { children, idx } = helpers
      .getState()
      .sections.createChildren({ ...payload });
    return helpers
      .getState()
      .sections.addChildren(payload.parentId, children, idx);
  }),

  deleteSections: action((state, payload) => {
    state.sections.deleteSections({ ...payload });
  }),

  deleteChildren: action((state, payload) => {
    state.sections.deleteChildren({ ...payload });
  }),

  addKwarg: action((state, payload) => {
    state.sections.addKwarg({ ...payload });
  }),

  deleteKwarg: action((state, payload) => {
    state.sections.deleteKwarg({ ...payload });
  }),

  replaceKwarg: action((state, payload) => {
    state.sections.replaceKwarg({ ...payload });
  }),

  exportSelected: thunk((action, payload, helpers) => {
    return createExportableObject(helpers.getState().sections);
  }),

  exportSaveableInfo: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const sections = state.sections;
    return sections.exportSaveableInfo();
  }),

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
