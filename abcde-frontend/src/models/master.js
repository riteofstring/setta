import { action, thunk, debug } from "easy-peasy";
import Data from "../data/big.json";
import { Section } from "../utils/jsonParser";
import {
  createStringId,
  findId,
  setChildrenVisibility,
  createExportableObject,
} from "../utils/sectionIds";
import { NO_AUTH } from "../utils/constants";
import { generateAndRunCode } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const master = {
  sectionCount: 1,
  originalRootSections: {},
  sections: {},
  selected: {},
  idHierarchy: {},
  rootIdHierarchy: {},
  isVisible: {},
  isShown: {},
  isList: {},
  isListRoot: {},
  listCount: {},
  sectionIdsToSectionHeadings: {},
  sectionIdsToStringIds: {},
  stringIdsToSectionIds: {},
  sectionHasNested: {},

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
        state.originalRootSections[id] = new Section(key, data[key]);
      }
      state.rootIdHierarchy[id] = {
        parent: null,
        children: [],
        moduleName: null,
        objName: null,
        parentModuleName: null,
        parentObjName: null,
      };
      state.sectionIdsToSectionHeadings[id] = isJson
        ? key
        : state.sections[id].name;
      state.sectionIdsToStringIds[id] = id;
      state.stringIdsToSectionIds[id] = id;
      state.sectionCount += 1;
      state.sectionHasNested[id] = false;
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
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (NO_AUTH) {
      action._loadSections({ isJson: true, data: Data });
    } else {
      action._loadSections(payload);
    }
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
    delete state.idHierarchy[sectionId]
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
    const { parentId, startingId, numSectionsToDelete } = payload;
    const state = helpers.getState();
    const parentObj = findId(
      parentId,
      state.idHierarchy,
      state.rootIdHierarchy
    );
    const startingIdx =
      startingId === null ? 0 : parentObj.children.indexOf(startingId);
    const trueNumSectionsToDelete = Math.min(
      numSectionsToDelete,
      parentObj.children.length
    );
    for (let i = 0; i < trueNumSectionsToDelete; i++) {
      const sectionId = parentObj.children[startingIdx];
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
    const {
      name: originalName,
      parentId,
      moduleName,
      objName,
      isList,
      siblingId,
    } = payload;
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

    let name = !siblingId && isList ? `List for ${originalName}` : originalName;
    if (helpers.getState().isListRoot[parentId]) {
      name = name.replace("List for ", "");
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
    const selected = createExportableObject({
      idHierarchy,
      rootIdHierarchy,
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
      globalCurr,
    });
    return { selected, globalCurr };
  }),

  runSelected: thunk(async (action, payload, helpers) => {
    const { selected } = payload;
    generateAndRunCode({
      cliSocket: helpers.getStoreState().cliSocket.cliSocket,
      SELECTED: selected,
      FACTORIES: helpers.getStoreState().factoriesInfo.factories,
      FUNCS: helpers.getStoreState().funcsInfo.funcs,
    });
  }),
};

export default master;
