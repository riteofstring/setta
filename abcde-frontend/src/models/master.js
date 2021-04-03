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
import { getPageMinMaxList } from "../utils/sectionIds";

const master = {
  sectionsPerPage: 5,
  spaceBetweenPages: 500,
  sectionCount: 0,
  pageMinMaxList: [],
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
      state.sectionCount += 1;
      let id = state.sectionCount;
      if (isJson) {
        state.sections[id] = new Section(key, data[key]);
      }
      state.idHierarchy[id] = newIdInHierarchy({
        sectionHeading: isJson ? key : state.sections[id].name,
        stringId: id,
      });
      state.stringIdsToSectionIds[id] = id;
    }
    state.pageMinMaxList = getPageMinMaxList(
      state.sectionCount,
      state.sectionsPerPage
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
    state.idHierarchy[sectionId].isShown = isShown;
  }),

  // stores what fields to show
  setSelected: action((state, payload) => {
    const { sectionId, moduleName, objName } = payload;
    state.idHierarchy[sectionId].moduleName = moduleName;
    state.idHierarchy[sectionId].objName = objName;
  }),

  setChildrenIds: action((state, payload) => {
    const { sectionId, childrenIds } = payload;
    state.idHierarchy[sectionId].children = childrenIds;
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
    const currIdHierarchy = state.idHierarchy;
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
      state.stringIdsToSectionIds[stringId] = id;

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
    const stringId = state.idHierarchy[sectionId].stringId;
    delete state.stringIdsToSectionIds[stringId];
    delete state.idHierarchy[sectionId];
    parentObj.children = parentObj.children.filter((x) => x !== sectionId);
  }),

  permanentlyDeleteSection: thunk((action, payload, helpers) => {
    const { sectionId, parentId } = payload;
    const state = helpers.getState();
    action._permanentlyDeleteSection({
      sectionId,
      parentObj: state.idHierarchy[parentId],
    });
  }),

  permanentlyDeleteMultipleSections: thunk((action, payload, helpers) => {
    const { parentId, startingId, numSectionsToDelete } = payload;
    const state = helpers.getState();
    const parentObj = state.idHierarchy[parentId];
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
    const foundId = state.idHierarchy[sectionId];
    setChildrenVisibility(foundId.children, state.idHierarchy, false);
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
          state.idHierarchy[parentId].listCount + 1
        ).toString();
      } else {
        extraIdentifier = "0";
      }
    }

    let name = !siblingId && isList ? `List for ${originalName}` : originalName;
    if (state.idHierarchy[parentId].isListRoot) {
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
      id = (state.sectionCount + 1).toString();
      action.incrementSectionCount();
    }

    console.log("addToVisibleSectionIdsThunk", id);
    const currInfo = state.idHierarchy;
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
