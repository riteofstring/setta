import { action, thunk, debug } from "easy-peasy";
import { getUISpecs } from "../data/fetchData";
import Data from "../data/big.json";
import { Section } from "../utils/jsonParser";
import {
  createStringId,
  getSplitId,
  parseNestedId,
  getTopLevelSectionId,
  createExportableObject,
  modifyId,
  findId,
  setChildrenVisibility,
} from "../utils/sectionIds";

const master = {
  sectionCount: 1,
  sections: {},
  selected: {},
  idHierarchy: {},
  rootIdHierarchy: {},
  isVisible: {},
  isShown: {},
  shiftAmount: {},
  isList: {},
  sectionIdsToSectionNames: {},
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
      state.stringIdsToSectionIds[id] = id;
      state.sectionCount += 1;
      state.inFocus.push(false);
      state.sectionHasNested[id] = false;
      state.sectionModuleObjHasNested[id] = false;
      state.isList[id] = false;
      state.isShown[id] = true;
      state.isVisible[id] = true;
    }
    state.selected = Object.keys(state.sections).reduce(
      (acc, curr) => ({ ...acc, [curr]: {} }),
      {}
    );
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
    state.stringIdsToSectionIds[stringId] = sectionId;
  }),

  setInFocus: action((state, payload) => {
    const x = parseInt(payload);
    state.inFocus = state.inFocus.map((e, idx) => idx === x);
  }),

  addToVisibleSectionIds: action((state, payload) => {
    const { id, name, moduleName, objName, parentId } = payload;
    console.log("********ADD**********", parentId, moduleName, objName, name);
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

      parentIdObj.children.push(id);
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
        state.isVisible,
        true,
        moduleName,
        objName
      );
    }
  }),

  deleteFromVisibleSectionIds: action((state, payload) => {
    console.log("********DELETE**********", payload);
    const foundId = findId(payload, state.idHierarchy, state.rootIdHierarchy);
    setChildrenVisibility(
      foundId.children,
      state.idHierarchy,
      state.isVisible,
      false
    );
  }),

  deleteFromVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
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
        (moduleName != prevModuleName) | (objName != prevObjName)
      ) {
        action.deleteFromVisibleSectionIds(prevSectionId);
      }
    }
  }),

  incrementSectionCount: action((state, payload) => {
    state.sectionCount += 1;
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const { name, sectionId: parentId, moduleName, objName, isList } = payload;
    const listPosition = isList ? "0" : null;
    const stringId = createStringId(
      parentId.toString(),
      moduleName,
      objName,
      name,
      listPosition
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
      });
    }
  }),

  exportSelected: thunk((action, payload, helpers) => {
    const { globalCurr } = helpers.getStoreState().globalCurr;
    const { selected } = helpers.getState();
    let output = createExportableObject(selected, globalCurr);
    output = JSON.stringify(output);
  }),
};

export default master;
