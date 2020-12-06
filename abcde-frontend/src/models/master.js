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
  visibleSectionIds: {},
  visible: {},
  shiftAmount: {},
  isList: {},
  sectionIdsToStringIds: {},
  sectionIdsToSectionNames: {},
  stringIdsToSectionIds: {},
  inFocus: [false],
  hasNested: {},

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    for (let key of Object.keys(payload)) {
      let id = state.sectionCount;
      state.sections[id] = new Section(key, payload[key]);
      state.visibleSectionIds[id] = {
        children: {},
        visible: true,
        moduleName: null,
        objName: null,
        parentModuleName: null,
        parentObjName: null,
      };
      state.shiftAmount[id] = 0;
      state.sectionIdsToStringIds[id] = key;
      state.sectionIdsToSectionNames[id] = key;
      state.stringIdsToSectionIds[key] = id;
      state.sectionCount += 1;
      state.inFocus.push(false);
      state.hasNested[id] = false
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
  setVisible: action((state, payload) => {
    const { sectionId, newVisible } = payload;
    state.visible[sectionId] = newVisible;
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
    state.sectionIdsToStringIds[sectionId] = stringId;
    state.sectionIdsToSectionNames[sectionId] = name;
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
    } = payload;
    const parentIdObj = findId(parentId, state.visibleSectionIds);
    parentIdObj.moduleName = moduleName;
    parentIdObj.objName = objName;
    if (!(id in state.selected)) {
      state.selected[id] = {};
      state.sections[id] =
        state.sections[parentId].moduleInfos[moduleName].objs[objName].params[
          name
        ].type;
      state.inFocus.splice(id, 0, false);

      // const moduleObjName = moduleObj(moduleName, objName)
      parentIdObj.children[id] = {
        children: {},
        visible: true,
        parentModuleName: moduleName,
        parentObjName: objName,
      };

      state.hasNested[parentId] = true

    } else {
      setChildrenVisibility(parentIdObj.children, true, moduleName, objName);
    }
  }),

  deleteFromVisibleSectionIds: action((state, payload) => {
    let foundId = findId(payload, state.visibleSectionIds);
    setChildrenVisibility(foundId.children, false);
  }),

  deleteFromVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const {
      sectionId: prevSectionId,
      moduleName: prevModuleName,
      objName: prevObjName,
    } = helpers.getStoreState().globalCurr;
    const { sectionId, moduleName, objName } = payload;
    if (
      sectionId === prevSectionId &&
      (moduleName != prevModuleName) | (objName != prevObjName)
    ) {
      action.deleteFromVisibleSectionIds(prevSectionId);
    }
  }),

  incrementSectionCount: action((state, payload) => {
    state.sectionCount += 1
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const { name, sectionId: parentId, moduleName, objName, isList } = payload;
    console.log("in ADD", parentId, moduleName, objName, name);
    const parentStringId = helpers.getState().sectionIdsToStringIds[parentId];
    const listPosition = isList ? "0" : null;
    const stringId = createStringId(
      parentStringId,
      moduleName,
      objName,
      name,
      listPosition
    );
    let id = helpers.getState().stringIdsToSectionIds[stringId];
    if (id === undefined) {
      id = helpers.getState().sectionCount
      action.incrementSectionCount()
      action.setStringId({ sectionId: id, stringId, name });
      action.setIsList({ sectionId: id, isList });
    }
    action.addToVisibleSectionIds({
      id,
      name,
      moduleName,
      objName,
      parentId,
    });
  }),

  exportSelected: thunk((action, payload, helpers) => {
    const { globalCurr } = helpers.getStoreState().globalCurr;
    const { selected } = helpers.getState();
    let output = createExportableObject(selected, globalCurr);
    output = JSON.stringify(output);
  }),
};

export default master;
