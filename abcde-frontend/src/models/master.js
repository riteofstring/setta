import { action, thunk, debug } from "easy-peasy";
import Data from "../data/data.json";
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
  stringIdsToSectionIds: {},

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
      state.idHierarchy[pageNum][id] = newIdInHierarchy({
        sectionHeading: isJson ? key : state.sections[id].name,
        stringId: id,
      });
      state.stringIdsToSectionIds[id] = id;
      state.sectionCount += 1;
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
    state.idHierarchy[state.currPage][sectionId].isShown = isShown;
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


  addToVisibleSectionIds: action((state, payload) => {
    const {
      id,
      name,
      moduleName,
      objName,
      parentId,
      isList,
      siblingId,
      sectionHeading,
      stringId,
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
        sectionHeading,
        stringId,
        isList,
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
          currIdHierarchy[parentId].listCount += 1;
        } else {
          currIdHierarchy[id].isListRoot = true;
          parentIdObj.children.push(id);
        }
      } else {
        parentIdObj.children.push(id);
      }

      parentIdObj.hasNested = true;
      currIdHierarchy[id].isShown = true;
      currIdHierarchy[id].isVisible = true;
    } else {
      setChildrenVisibility(
        parentIdObj.children,
        currIdHierarchy,
        true,
        moduleName,
        objName
      );
    }
  }),

  _permanentlyDeleteSection: action((state, payload) => {
    const { sectionId, parentObj } = payload;
    const stringId = state.idHierarchy[state.currPage][sectionId].stringId;
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
    const state = helpers.getState();
    if (isList) {
      if (siblingId !== null) {
        extraIdentifier = (
          state.idHierarchy[state.currPage][parentId].listCount + 1
        ).toString();
      } else {
        extraIdentifier = "0";
      }
    }

    let name = !siblingId && isList ? `List for ${originalName}` : originalName;
    if (state.idHierarchy[state.currPage][parentId].isListRoot) {
      name = name.replace("List for ", "");
    }

    const stringId = createStringId(
      parentId.toString(),
      moduleName,
      objName,
      name,
      extraIdentifier
    );

    let id = state.stringIdsToSectionIds[stringId];
    if (id === undefined) {
      id = state.sectionCount.toString();
      action.incrementSectionCount();
    }

    console.log("addToVisibleSectionIdsThunk", id);
    const currInfo = state.idHierarchy[state.currPage];
    if (!(id in currInfo) || !currInfo.isVisible) {
      action.addToVisibleSectionIds({
        id,
        name,
        moduleName,
        objName,
        parentId,
        isList,
        siblingId,
        sectionHeading: name,
        stringId,
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
