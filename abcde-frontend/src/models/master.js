import { action, thunk, debug } from "easy-peasy";
import Data from "../data/simpleTrainTest.json";
import { SectionInfo } from "../classes/jsonParser";
import { Section } from "../classes/section";
import { Sections } from "../classes/sections";
import { NO_AUTH } from "../utils/constants";
import { generateAndRunCode } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { getPageMinMaxList } from "../utils/sectionIds";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  pageMinMaxList: [],
  sections: new Sections(),

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    state.sections.available = {
      modules: payload.MODULES,
      parameters: payload.PARAMETERS,
    };
    for (let key of Object.keys(payload.UI)) {
      console.log("key", key);
      state.sections.addSection(
        new Section(
          key,
          new SectionInfo(key, payload.UI[key], state.sections.available)
        )
      );
    }
    state.pageMinMaxList = getPageMinMaxList(
      state.sections.numRootIds(),
      state.sectionsPerPage
    );
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (NO_AUTH) {
      action._loadSections(Data);
    } else {
      action._loadSections(payload);
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

  // exportSelected: thunk((action, payload, helpers) => {
  //   const { globalCurr } = helpers.getStoreState().globalCurr;
  //   const {
  //     idHierarchy,
  //     sectionIdsToSectionHeadings,
  //     isList,
  //     isListRoot,
  //   } = helpers.getState();
  //   const selected = createExportableObject({
  //     idHierarchy,
  //     sectionIdsToSectionHeadings,
  //     isList,
  //     isListRoot,
  //     globalCurr,
  //   });
  //   return { selected, globalCurr };
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
