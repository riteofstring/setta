import { action, thunk, debug } from "easy-peasy";
import { getUISpecs } from "../data/fetchData";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";
import {
  createId,
  getSplitId,
  parseNestedId,
  getTopLevelSectionId,
  createExportableObject,
  modifyId,
  findId,
} from "../utils/sectionIds";

const master = {
  sectionCount: 1,
  sections: {},
  selected: {},
  visibleSectionIds: {},
  visibleSectionIdsHistory: {},
  visible: {},
  shiftAmount: {},
  isList: {},
  stringIds: {},
  takenStringIds: {},
  inFocus: [false],

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    for (let key of Object.keys(payload)) {
      let id = state.sectionCount;
      state.sections[id] = new Section(key, payload[key]);
      state.visibleSectionIds[id] = { id, children: {} };
      state.visibleSectionIdsHistory[id] = { id, children: {} };
      state.shiftAmount[id] = 0;
      state.stringIds[id] = key;
      state.takenStringIds[key] = id;
      state.sectionCount += 1;
      state.inFocus.push(false);
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
    const { sectionId, shiftAmount } = payload;
    state.shiftAmount[sectionId] = shiftAmount;
  }),

  setIsList: action((state, payload) => {
    const { sectionId, isList } = payload;
    state.isList[sectionId] = isList;
  }),

  setStringId: action((state, payload) => {
    const { sectionId, stringId } = payload;
    state.stringIds[sectionId] = stringId;
    state.takenStringIds[stringId] = sectionId;
  }),

  setInFocus: action((state, payload) => {
    const x = parseInt(payload);
    state.inFocus = state.inFocus.map((e, idx) => idx === x);
  }),

  addToVisibleSectionIds: action((state, payload) => {
    const { id, name, moduleName, objName, parentId } = payload;
    let curr = state.visibleSectionIds;
    let currHistory = state.visibleSectionIdsHistory;
    const parentIdObj = findId(parentId, curr);
    const parentIdObjHistory = findId(parentId, currHistory);
    const idObj = findId(id, parentIdObj.children);
    if (idObj === null) {
      const historyObj = findId(id, parentIdObjHistory.children);
      if (historyObj !== null) {
        parentIdObj.children[id] = JSON.parse(JSON.stringify(historyObj));
      } else {
        parentIdObj.children[id] = { id, children: {} };
        parentIdObjHistory.children[id] = { id, children: {} };
      }
    }
    if (!(id in state.selected)) {
      state.selected[id] = {};
      state.sections[id] =
        state.sections[parentId].moduleInfos[moduleName].objs[objName].params[
          name
        ].type;
      state.inFocus.splice(id, 0, false);
    }
  }),

  deleteVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
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
      console.log("DELETE", prevSectionId, sectionId)
      let foundId = findId(prevSectionId, helpers.getState().visibleSectionIds)
      console.log("foundId", foundId)
      foundId.children = {}
    }
  }),

  getSectionId: thunk((action, payload, helpers) => {
    const id = helpers.getState().sectionCount;
    helpers.getState().sectionCount += 1;
    return id;
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    console.log("in ADD");
    const { name, sectionId: parentId, moduleName, objName, isList } = payload;
    const parentStringId = helpers.getState().stringIds[parentId];
    const listPosition = isList ? "0" : null;
    const newStringId = createId(
      parentStringId,
      moduleName,
      objName,
      name,
      listPosition
    );
    let id = helpers.getState().takenStringIds[newStringId];
    if (id === undefined) {
      id = action.getSectionId();
      action.setStringId({ sectionId: id, stringId: newStringId });
      action.setIsList({ sectionId: id, isList });
      action.addToVisibleSectionIds({
        id,
        name,
        moduleName,
        objName,
        parentId,
      });
    }
    // console.log("visibleSectionIds", debug(helpers.getState().visibleSectionIds))
  }),

  exportSelected: thunk((action, payload, helpers) => {
    const { globalCurr } = helpers.getStoreState().globalCurr;
    const { selected } = helpers.getState();
    let output = createExportableObject(selected, globalCurr);
    output = JSON.stringify(output);
  }),
};

export default master;
