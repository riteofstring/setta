import { action, thunk, debug } from "easy-peasy";
import Data from "../data/simpleTrainTest.json";
import { SectionInfo } from "../classes/jsonParser";
import { Section, Sections } from "../classes/section";
import {
  createStringId,
  setChildrenVisibility,
  createExportableObject,
} from "../utils/sectionIds";
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
    const { sectionId, childrenIds } = payload;
    state.sections[sectionId].childrenIds = childrenIds;
  }),

  addChild: action((state, payload) => {
    const { child, idx } = state.sections.createChild({ ...payload });
    state.sections.addChild(child, idx);
  }),

  deleteSection: action((state, payload) => {
    state.sections.deleteSection({ ...payload });
  }),

  deleteMultipleSections: action((state, payload) => {}),

  // addToVisibleSectionIds: action((state, payload) => {
  //   const {
  //     id,
  //     name,
  //     moduleName,
  //     objName,
  //     parentId,
  //     isList,
  //     siblingId,
  //     sectionHeading,
  //     stringId,
  //   } = payload;

  //   const currIdHierarchy = state.idHierarchy;
  //   const parentIdObj = currIdHierarchy[parentId];
  //   parentIdObj.moduleName = moduleName;
  //   parentIdObj.objName = objName;
  //   if (!(id in currIdHierarchy)) {
  //     currIdHierarchy[id] = newIdInHierarchy({
  //       parent: parentId,
  //       parentModuleName: moduleName,
  //       parentObjName: objName,
  //       sectionHeading,
  //       stringId,
  //       isList,
  //     });
  //     state.stringIdsToSectionIds[stringId] = id;

  //     if (isList && siblingId === null) {
  //       state.sections[id] = state.sections[parentId];
  //       currIdHierarchy[id].moduleName = moduleName;
  //       currIdHierarchy[id].objName = objName;
  //     } else {
  //       state.sections[id] = sectionParameterGetter(
  //         state.sections,
  //         parentId,
  //         moduleName,
  //         objName,
  //         name
  //       ).type;
  //     }

  //     if (isList) {
  //       if (siblingId !== null) {
  //         const spliceIdx = parentIdObj.children.indexOf(siblingId) + 1;
  //         parentIdObj.children.splice(spliceIdx, 0, id);
  //         currIdHierarchy[parentId].listCount += 1;
  //       } else {
  //         currIdHierarchy[id].isListRoot = true;
  //         parentIdObj.children.push(id);
  //       }
  //     } else {
  //       parentIdObj.children.push(id);
  //     }

  //     parentIdObj.hasNested = true;
  //     currIdHierarchy[id].isShown = true;
  //     currIdHierarchy[id].isVisible = true;
  //   } else {
  //     setChildrenVisibility(
  //       parentIdObj.children,
  //       currIdHierarchy,
  //       true,
  //       moduleName,
  //       objName
  //     );
  //   }
  // }),

  // permanentlyDeleteSection: action((state, payload) => {
  //   const { sectionId, parentId } = payload;
  //   if (sectionId in state.idHierarchy) {
  //     const stringId = state.idHierarchy[sectionId].stringId;
  //     delete state.stringIdsToSectionIds[stringId];
  //     delete state.idHierarchy[sectionId];
  //     delete state.sections[sectionId];
  //   }
  //   const parentObj = state.idHierarchy[parentId];
  //   parentObj.children = parentObj.children.filter((x) => x !== sectionId);
  // }),

  // permanentlyDeleteMultipleSections: thunk((action, payload, helpers) => {
  //   const { parentId, startingId, numSectionsToDelete } = payload;
  //   const state = helpers.getState();
  //   const parentObj = state.idHierarchy[parentId];
  //   const startingIdx =
  //     startingId === null ? 0 : parentObj.children.indexOf(startingId);
  //   const trueNumSectionsToDelete = Math.min(
  //     numSectionsToDelete,
  //     parentObj.children.length
  //   );
  //   for (let i = 0; i < trueNumSectionsToDelete; i++) {
  //     const sectionId = parentObj.children[startingIdx];
  //     action.permanentlyDeleteSection({ sectionId, parentObj });
  //   }
  // }),

  // deleteChildrenFromVisibleSectionIds: action((state, payload) => {
  //   const { sectionId } = payload;
  //   const foundId = state.idHierarchy[sectionId];
  //   setChildrenVisibility(foundId.children, state.idHierarchy, false);
  // }),

  // incrementSectionCount: action((state, payload) => {
  //   state.sectionCount += 1;
  // }),

  // addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
  //   const {
  //     name: originalName,
  //     parentId,
  //     moduleName,
  //     objName,
  //     isList,
  //     siblingId,
  //   } = payload;
  //   let extraIdentifier = null;
  //   const state = helpers.getState();
  //   if (isList) {
  //     if (siblingId !== null) {
  //       extraIdentifier = (
  //         state.idHierarchy[parentId].listCount + 1
  //       ).toString();
  //     } else {
  //       extraIdentifier = "0";
  //     }
  //   }

  //   let name = !siblingId && isList ? `List for ${originalName}` : originalName;
  //   if (state.idHierarchy[parentId].isListRoot) {
  //     name = name.replace("List for ", "");
  //   }

  //   const stringId = createStringId(
  //     parentId.toString(),
  //     moduleName,
  //     objName,
  //     name,
  //     extraIdentifier
  //   );

  //   let id = state.stringIdsToSectionIds[stringId];
  //   if (id === undefined) {
  //     id = (state.sectionCount + 1).toString();
  //     action.incrementSectionCount();
  //   }

  //   const currInfo = state.idHierarchy;
  //   if (!(id in currInfo) || !currInfo.isVisible) {
  //     action.addToVisibleSectionIds({
  //       id,
  //       name,
  //       moduleName,
  //       objName,
  //       parentId,
  //       isList,
  //       siblingId,
  //       sectionHeading: name,
  //       stringId,
  //     });
  //   }
  //   return id;
  // }),

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
