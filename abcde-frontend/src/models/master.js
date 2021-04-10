import { action, thunk, debug } from "easy-peasy";
import Data from "../data/simpleTrainTest.json";
import { SectionInfo } from "../classes/jsonParser";
import { Section } from "../classes/section";
import { Sections } from "../classes/sections";
import { NO_AUTH } from "../utils/constants";
import {
  combineModules,
  combineParameters,
  sectionParameterGetter,
} from "../utils/utils";
import { generateAndRunCode } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { getPageMinMaxList } from "../utils/sectionIds";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  pageMinMaxList: [],
  sections: new Sections(),
  availableModules: {},
  availableParameters: {},

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    state.availableModules = payload.MODULES;
    state.availableParameters = payload.PARAMETERS;
    for (let key of Object.keys(payload.UI)) {
      const currSection = payload.UI[key];
      let combinedJsons = null;
      if (Array.isArray(currSection) || currSection["modules"]) {
        combinedJsons = combineModules(state.availableModules, currSection);
      } else if (currSection["parameters"]) {
        combinedJsons = combineParameters(
          state.availableParameters,
          currSection["parameters"]
        );
      } else {
        throw "Invalid json";
      }
      state.sections.addSection(
        new Section(new SectionInfo(key, combinedJsons), key)
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

  setSectionParamType: action((state, payload) => {
    const { sectionId, moduleName, objName, paramName, newType } = payload;
    const x = sectionParameterGetter(
      state.sections,
      sectionId,
      moduleName,
      objName,
      paramName
    );
    x.type = newType;
  }),

  setSectionModuleInfos: action((state, payload) => {
    const { sectionId, newModuleInfos } = payload;
    state.sections[sectionId].moduleInfos = newModuleInfos;
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

  addChildren: action((state, payload) => {
    const { children, idx } = state.sections.createChildren({ ...payload });
    state.sections.addChildren(payload.parentId, children, idx);
  }),

  deleteSections: action((state, payload) => {
    state.sections.deleteSections({ ...payload });
  }),

  deleteChildren: action((state, payload) => {
    state.sections.deleteChildren({ ...payload });
  }),

  setHasBeenVisited: action((state, payload) => {
    state.sections.setHasBeenVisited({ ...payload });
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
