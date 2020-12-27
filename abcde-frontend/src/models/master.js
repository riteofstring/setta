import { action, thunk, debug } from "easy-peasy";
import { getUISpecs } from "../data/fetchData";
import Data from "../data/simpleTrainTest.json";
import { Section } from "../utils/jsonParser";
import {
  createStringId,
  findId,
  setChildrenVisibility,
  tryPushingToList,
  createExportableObject,
} from "../utils/sectionIds";

const { ipcRenderer } = window.require("electron");

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
  listSiblings: {},
  listCount: {},
  sectionIdsToSectionNames: {},
  sectionIdsToStringIds: {},
  stringIdsToSectionIds: {},
  inFocus: [false],
  sectionHasNested: {},
  sectionModuleObjHasNested: {},

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    for (let key of Object.keys(payload)) {
      let id = state.sectionCount;
      state.sections[id] = new Section(key, payload[key]);
      state.rootIdHierarchy[id] = {
        children: [],
        moduleName: null,
        objName: null,
        parentModuleName: null,
        parentObjName: null,
      };
      state.shiftAmount[id] = 0;
      state.sectionIdsToSectionNames[id] = key;
      state.sectionIdsToStringIds[id] = id;
      state.stringIdsToSectionIds[id] = id;
      state.sectionCount += 1;
      state.inFocus.push(false);
      state.sectionHasNested[id] = false;
      state.sectionModuleObjHasNested[id] = false;
      state.isList[id] = null;
      state.isListRoot[id] = false;
      state.listSiblings[id] = [];
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

  loadSections: thunk((action, payload, helpers) => {
    // getUISpecs().then((res) => action._loadSections(res.data));
    action._loadSections(Data);
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

  setIsList: action((state, payload) => {
    const { sectionId, isList } = payload;
    state.isList[sectionId] = isList;
  }),

  setStringId: action((state, payload) => {
    const { sectionId, stringId, name } = payload;
    state.sectionIdsToSectionNames[sectionId] = name;
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
      state.selected[id] = {};
      state.sections[id] =
        state.sections[parentId].moduleInfos[moduleName].objs[objName].params[
          name
        ].type;
      state.inFocus.splice(id, 0, false);

      if (isList) {
        if (siblingId !== null) {
          const spliceIdx = parentIdObj.children.indexOf(siblingId) + 1;
          parentIdObj.children.splice(spliceIdx, 0, id);
          state.listSiblings[siblingId] = tryPushingToList(
            state.listSiblings[siblingId],
            id
          );
          state.listCount[siblingId] += 1;
          for (let S of state.listSiblings[siblingId]) {
            if (S !== id) {
              state.listSiblings[S] = tryPushingToList(
                state.listSiblings[S],
                id
              );
              state.listCount[S] += 1;
            }
          }
          state.listSiblings[id] = state.listSiblings[siblingId]
            .filter((x) => x !== id)
            .concat([siblingId]);
          state.listCount[id] = state.listCount[siblingId];
        } else {
          state.isListRoot[id] = true;
          state.listCount[id] = 1;
          parentIdObj.children.push(id);
        }
      } else {
        parentIdObj.children.push(id);
      }
      state.idHierarchy[id] = {
        children: [],
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

  permanentlyDeleteSection: action((state, payload) => {
    const { sectionId, parentId } = payload;
    const stringId = state.sectionIdsToStringIds[sectionId];
    delete state.stringIdsToSectionIds[stringId];
    delete state.listSiblings[sectionId];
    for (let k of Object.keys(state.listSiblings)) {
      state.listSiblings[k] = state.listSiblings[k].filter(
        (x) => x !== sectionId
      );
    }
    const foundId = findId(parentId, state.idHierarchy, state.rootIdHierarchy);
    foundId.children = foundId.children.filter((x) => x !== sectionId);
  }),

  deleteChildrenFromVisibleSectionIds: action((state, payload) => {
    const foundId = findId(payload, state.idHierarchy, state.rootIdHierarchy);
    setChildrenVisibility(
      foundId.children,
      state.idHierarchy,
      state.isVisible,
      false
    );
  }),

  deleteChildrenFromVisibleSectionIdsThunk: thunk(
    (action, payload, helpers) => {
      const {
        sectionId: prevSectionId,
        moduleName: prevModuleName,
        objName: prevObjName,
      } = helpers.getStoreState().globalCurr;
      const x = createStringId(prevSectionId, prevModuleName, prevObjName);
      if (helpers.getState().sectionModuleObjHasNested[x]) {
        const { sectionId, moduleName, objName } = payload;
        if (
          sectionId === prevSectionId &&
          (moduleName !== prevModuleName) | (objName !== prevObjName)
        ) {
          action.deleteChildrenFromVisibleSectionIds(prevSectionId);
        }
      }
    }
  ),

  incrementSectionCount: action((state, payload) => {
    state.sectionCount += 1;
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const {
      name,
      sectionId: parentId,
      moduleName,
      objName,
      isList,
      siblingId,
    } = payload;
    let extraIdentifier = null;
    if (isList) {
      if (siblingId !== null) {
        extraIdentifier = (
          helpers.getState().listCount[siblingId] + 1
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
      sectionIdsToSectionNames,
      isList,
    } = helpers.getState();
    let output = createExportableObject({
      idHierarchy,
      rootIdHierarchy,
      sectionIdsToSectionNames,
      isList,
      globalCurr,
    });
    // console.log("output", output);
    // console.log(ipcRenderer.sendSync("synchronous-message", "ping")); // prints "pong"

    // ipcRenderer.on("asynchronous-reply", (event, arg) => {
    //   console.log(arg); // prints "pong"
    // });
    ipcRenderer.send("asynchronous-message", {arg: "run program", data: output});
  }),
};

export default master;
