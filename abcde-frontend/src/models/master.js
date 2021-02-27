import { action, thunk, debug } from "easy-peasy";
import Data from "../data/longList.json";
import { Section } from "../utils/jsonParser";
import {
  createStringId,
  findId,
  setChildrenVisibility,
  createExportableObject,
} from "../utils/sectionIds";
import { NO_AUTH } from "../utils/constants";
import {
  saveUI as saveUIBackend,
  generateCode as generateCodeBackend,
} from "../dbRequests/ui";
import { v4 as uuidv4 } from "uuid";

const master = {
  sectionCount: 1,
  sections: {},
  loadSectionsIsDone: false,
  selected: {},
  idHierarchy: {},
  rootIdHierarchy: {},
  isVisible: {},
  isShown: {},
  shiftAmount: {},
  isList: {},
  isListRoot: {},
  listCount: {},
  sectionIdsToSectionHeadings: {},
  sectionIdsToStringIds: {},
  stringIdsToSectionIds: {},
  inFocus: [false],
  sectionHasNested: {},
  sectionModuleObjHasNested: {},
  sectionSearchVal: {},
  showTerminal: false,

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    const { isJson, data } = payload;
    if (!isJson) {
      state.sections = data;
    }
    for (let key of Object.keys(data)) {
      let id = state.sectionCount;
      if (isJson) {
        state.sections[id] = new Section(key, data[key]);
      }
      state.rootIdHierarchy[id] = {
        parent: null,
        children: [],
        moduleName: null,
        objName: null,
        parentModuleName: null,
        parentObjName: null,
      };
      state.shiftAmount[id] = 0;
      state.sectionIdsToSectionHeadings[id] = isJson
        ? key
        : state.sections[id].name;
      state.sectionIdsToStringIds[id] = id;
      state.stringIdsToSectionIds[id] = id;
      state.sectionCount += 1;
      state.inFocus.push(false);
      state.sectionHasNested[id] = false;
      state.sectionModuleObjHasNested[id] = false;
      state.isList[id] = null;
      state.isListRoot[id] = false;
      state.listCount[id] = 0;
      state.isShown[id] = true;
      state.isVisible[id] = true;
    }
    state.selected = Object.keys(state.sections).reduce(
      (acc, curr) => ({ ...acc, [curr]: {} }),
      {}
    );
    state.loadSectionsIsDone = true;
  }),

  // temporary shitty code
  resetSections: action((state) => {
    state.sectionCount = 1;
    state.sections = {};
    state.loadSectionsIsDone = false;
    state.selected = {};
    state.idHierarchy = {};
    state.rootIdHierarchy = {};
    state.isVisible = {};
    state.isShown = {};
    state.shiftAmount = {};
    state.isList = {};
    state.isListRoot = {};
    state.listSiblings = {};
    state.listCount = {};
    state.sectionIdsToSectionHeadings = {};
    state.sectionIdsToStringIds = {};
    state.stringIdsToSectionIds = {};
    state.inFocus = [false];
    state.sectionHasNested = {};
    state.sectionModuleObjHasNested = {};
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (NO_AUTH) {
      action._loadSections({ isJson: true, data: Data });
    } else {
      action._loadSections({ isJson: true, data: payload });
    }
  }),

  setLoadSectionsIsDone: action((state, payload) => {
    state.loadSectionsIsDone = payload;
  }),

  // Show/Collapse button
  setIsShown: action((state, payload) => {
    const { sectionId, isShown } = payload;
    state.isShown[sectionId] = isShown;
  }),

  // stores what fields to show
  setSelected: action((state, payload) => {
    const { sectionId, moduleName, name } = payload;
    state.selected[sectionId] = { moduleName, name };
    let h =
      sectionId in state.rootIdHierarchy
        ? state.rootIdHierarchy
        : state.idHierarchy;
    h[sectionId].moduleName = moduleName;
    h[sectionId].objName = name;
  }),

  setShiftAmount: action((state, payload) => {
    const { rootId, shiftAmount } = payload;
    state.shiftAmount[rootId] = shiftAmount;
  }),

  setChildrenIds: action((state, payload) => {
    const { sectionId, childrenIds } = payload;
    if (sectionId in state.rootIdHierarchy) {
      state.rootIdHierarchy[sectionId].children = childrenIds;
    } else {
      state.idHierarchy[sectionId].children = childrenIds;
    }
  }),

  setIsList: action((state, payload) => {
    const { sectionId, isList } = payload;
    state.isList[sectionId] = isList;
  }),

  setStringId: action((state, payload) => {
    const { sectionId, stringId, name } = payload;
    state.sectionIdsToSectionHeadings[sectionId] = name;
    state.sectionIdsToStringIds[sectionId] = stringId;
    state.stringIdsToSectionIds[stringId] = sectionId;
  }),

  setInFocus: action((state, payload) => {
    const x = parseInt(payload);
    state.inFocus = state.inFocus.map((e, idx) => idx === x);
  }),

  addToVisibleSectionIds: action((state, payload) => {
    const {
      id,
      name,
      moduleName,
      objName,
      parentId,
      isList,
      siblingId,
    } = payload;
    const parentIdObj = findId(
      parentId,
      state.idHierarchy,
      state.rootIdHierarchy
    );
    parentIdObj.moduleName = moduleName;
    parentIdObj.objName = objName;
    if (!(id in state.selected)) {
      if (isList && siblingId === null) {
        state.sections[id] = state.sections[parentId];
        state.selected[id] = state.selected[parentId];
      } else {
        state.sections[id] =
          state.sections[parentId].moduleInfos[moduleName].objs[objName].params[
            name
          ].type;
        state.selected[id] = {};
      }
      state.inFocus.splice(id, 0, false);

      if (isList) {
        if (siblingId !== null) {
          const spliceIdx = parentIdObj.children.indexOf(siblingId) + 1;
          parentIdObj.children.splice(spliceIdx, 0, id);
          state.listCount[parentId] += 1;
        } else {
          if (!(id in state.listCount)) {
            state.listCount[id] = 0;
          }
          state.isListRoot[id] = true;
          parentIdObj.children.push(id);
        }
      } else {
        parentIdObj.children.push(id);
      }
      state.idHierarchy[id] = {
        children: [],
        parent: parentId,
        parentModuleName: moduleName,
        parentObjName: objName,
      };

      state.sectionHasNested[parentId] = true;
      state.sectionModuleObjHasNested[
        createStringId(parentId, moduleName, objName)
      ] = true;
      state.isShown[id] = true;
      state.isVisible[id] = true;
    } else {
      setChildrenVisibility(
        parentIdObj.children,
        state.idHierarchy,
        state.isVisible,
        true,
        moduleName,
        objName
      );
    }
  }),

  _permanentlyDeleteSection: action((state, payload) => {
    const { sectionId, parentObj } = payload;
    const stringId = state.sectionIdsToStringIds[sectionId];
    delete state.stringIdsToSectionIds[stringId];
    parentObj.children = parentObj.children.filter((x) => x !== sectionId);
  }),

  permanentlyDeleteSection: thunk((action, payload, helpers) => {
    const { sectionId, parentId } = payload;
    const state = helpers.getState();
    const parentObj = findId(
      parentId,
      state.idHierarchy,
      state.rootIdHierarchy
    );
    action._permanentlyDeleteSection({ sectionId, parentObj });
  }),

  permanentlyDeleteMultipleSections: thunk((action, payload, helpers) => {
    const { parentId, numSectionsToDelete } = payload;
    const state = helpers.getState();
    const parentObj = findId(
      parentId,
      state.idHierarchy,
      state.rootIdHierarchy
    );
    for (let i = 0; i < numSectionsToDelete; i++) {
      const sectionId = parentObj.children[0];
      action._permanentlyDeleteSection({ sectionId, parentObj });
    }
  }),

  deleteChildrenFromVisibleSectionIds: action((state, payload) => {
    const { sectionId } = payload;
    const foundId = findId(sectionId, state.idHierarchy, state.rootIdHierarchy);
    setChildrenVisibility(
      foundId.children,
      state.idHierarchy,
      state.isVisible,
      false
    );
  }),

  incrementSectionCount: action((state, payload) => {
    state.sectionCount += 1;
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const { name, parentId, moduleName, objName, isList, siblingId } = payload;
    let extraIdentifier = null;
    if (isList) {
      if (siblingId !== null) {
        extraIdentifier = (
          helpers.getState().listCount[parentId] + 1
        ).toString();
      } else {
        extraIdentifier = "0";
      }
    }
    const stringId = createStringId(
      parentId.toString(),
      moduleName,
      objName,
      name,
      extraIdentifier
    );
    let id = helpers.getState().stringIdsToSectionIds[stringId];
    if (id === undefined) {
      id = helpers.getState().sectionCount.toString();
      action.incrementSectionCount();
      action.setStringId({ sectionId: id, stringId, name });
      action.setIsList({ sectionId: id, isList });
    }
    if (!helpers.getState().isVisible[id]) {
      action.addToVisibleSectionIds({
        id,
        name,
        moduleName,
        objName,
        parentId,
        isList,
        siblingId,
      });
    }
  }),

  exportSelected: thunk((action, payload, helpers) => {
    const { globalCurr } = helpers.getStoreState().globalCurr;
    const {
      idHierarchy,
      rootIdHierarchy,
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
    } = helpers.getState();
    const selections = createExportableObject({
      idHierarchy,
      rootIdHierarchy,
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
      globalCurr,
    });
    return { selections, globalCurr };
  }),

  runSelected: thunk(async (action, payload, helpers) => {
    const { token, selections } = payload;
    const codeToken = uuidv4();
    const result = await generateCodeBackend({
      token,
      codeToken,
      uiSelections: selections,
    });
    console.log("runSelected result", result);
    if (result) {
      console.log("result", result);
      window.open("abcde://" + codeToken, "_self");
    }
  }),

  saveUI: action((state, payload) => {
    const { token, uiName, selections, globalCurr } = payload;
    const sections = state.sections;
    saveUIBackend({ token, uiName, sections, selections, globalCurr });
  }),

  setSectionSearchVal: action((state, payload) => {
    const { sectionId, value } = payload;
    state.sectionSearchVal[sectionId] = value;
  }),

  setShowTerminal: action((state, payload) => {
    state.showTerminal = !state.showTerminal;
  }),
};

export default master;
