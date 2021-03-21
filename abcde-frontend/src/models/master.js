import { action, thunk, debug } from "easy-peasy";
import Data from "../data/multiPage.json";
import { Section } from "../utils/jsonParser";
import {
  createStringId,
  setChildrenVisibility,
  createExportableObject,
  newIdInHierarchy,
} from "../utils/sectionIds";
import { NO_AUTH } from "../utils/constants";
import { generateAndRunCode } from "../dbRequests/ui";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const master = {
  sectionsPerPage: 5,
  currPage: 1,
  sectionCount: 1,
  sections: {},
  idHierarchy: {},
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
      }
      let pageNum = Math.trunc((id - 1) / state.sectionsPerPage) + 1;
      if (!(pageNum in state.idHierarchy)) {
        state.idHierarchy[pageNum] = {};
      }
      state.idHierarchy[pageNum][id] = newIdInHierarchy();
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
  }),

  setCurrPage: action((state, payload) => {
    state.currPage = payload;
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
    const { sectionId, moduleName, objName } = payload;
    state.idHierarchy[state.currPage][sectionId].moduleName = moduleName;
    state.idHierarchy[state.currPage][sectionId].objName = objName;
  }),

  setChildrenIds: action((state, payload) => {
    const { sectionId, childrenIds } = payload;
    state.idHierarchy[state.currPage][sectionId].children = childrenIds;
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
    const currIdHierarchy = state.idHierarchy[state.currPage];
    const parentIdObj = currIdHierarchy[parentId];
    parentIdObj.moduleName = moduleName;
    parentIdObj.objName = objName;
    if (!(id in currIdHierarchy)) {
      currIdHierarchy[id] = newIdInHierarchy({
        parent: parentId,
        parentModuleName: moduleName,
        parentObjName: objName,
      });
      if (isList && siblingId === null) {
        state.sections[id] = state.sections[parentId];
        currIdHierarchy[id].moduleName = moduleName;
        currIdHierarchy[id].objName = objName;
      } else {
        state.sections[id] =
          state.sections[parentId].moduleInfos[moduleName].objs[objName].params[
            name
          ].type;
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

      state.sectionHasNested[parentId] = true;
      state.isShown[id] = true;
      state.isVisible[id] = true;
    } else {
      setChildrenVisibility(
        parentIdObj.children,
        currIdHierarchy,
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
    delete state.idHierarchy[state.currPage][sectionId];
    parentObj.children = parentObj.children.filter((x) => x !== sectionId);
  }),

  permanentlyDeleteSection: thunk((action, payload, helpers) => {
    const { sectionId, parentId } = payload;
    const state = helpers.getState();
    action._permanentlyDeleteSection({
      sectionId,
      parentObj: state.idHierarchy[state.currPage][parentId],
    });
  }),

  permanentlyDeleteMultipleSections: thunk((action, payload, helpers) => {
    const { parentId, startingId, numSectionsToDelete } = payload;
    const state = helpers.getState();
    const parentObj = state.idHierarchy[state.currPage][parentId];
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
    const foundId = state.idHierarchy[state.currPage][sectionId];
    setChildrenVisibility(
      foundId.children,
      state.idHierarchy[state.currPage],
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
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
    } = helpers.getState();
    const selected = createExportableObject({
      idHierarchy,
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
