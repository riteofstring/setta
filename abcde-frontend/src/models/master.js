import { action, thunk } from "easy-peasy";
import { getUISpecs } from "../data/fetchData";
import Data from "../data/big.json"
import { Section } from "../utils/jsonParser";
import {
  createId,
  getSplitId,
  parseNestedId,
  getTopLevelSectionId,
  createExportableObject,
} from "../utils/sectionIds";

const master = {
  sections: {},
  selected: {},
  visibleSectionIds: {},
  visibleSectionIdsHistory: {},
  prevSectionIdExParam: null,
  currSectionIdExParam: null,
  activeObj: "",
  visible: {},
  shiftAmount: {},

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    for (let key of Object.keys(payload)) {
      state.sections[key] = new Section(key, payload[key]);
    }
    state.selected = Object.keys(state.sections).reduce(
      (acc, curr) => ({ ...acc, [curr]: {} }),
      {}
    );
    for (let k of Object.keys(state.selected)) {
      state.visibleSectionIds[k] = {};
      state.visibleSectionIdsHistory[k] = {};
      state.shiftAmount[k] = 0;
    }
  }),

  loadSections: thunk((action, payload, helpers) => {
    // getUISpecs().then((res) => action._loadSections(res.data));
    action._loadSections(Data)
  }),

  // Show/Collapse button
  setVisible: action((state, payload) => {
    const { sectionId, newVisible } = payload;
    state.visible[sectionId] = newVisible;
  }),

  // stores what fields to show
  setSelected: action((state, payload) => {
    const { sectionId, moduleName, name, currParams } = payload;
    state.selected[sectionId] = { moduleName, name, params: currParams };
  }),

  // string name of currently active object
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),

  setShiftAmount: action((state, payload) => {
    const { sectionId, shiftAmount } = payload;
    state.shiftAmount[sectionId] = shiftAmount;
  }),

  modifyVisibleSectionIds: action((state, payload) => {
    const { fullId, command } = payload;
    const splitId = getSplitId(fullId);
    const numParents = splitId.length - 1;
    const id = splitId[numParents];
    let curr = state.visibleSectionIds;
    let currHistory = state.visibleSectionIdsHistory;
    for (let i = 0; i < numParents; i++) {
      curr = curr[splitId[i]];
      currHistory = currHistory[splitId[i]];
    }
    if (command === "add") {
      if (!(id in curr)) {
        curr[id] = {};
        if (id in currHistory) {
          const previouslySelectedObj = state.selected[fullId].name;
          for (let k of Object.keys(currHistory[id])) {
            if (parseNestedId(k).objName === previouslySelectedObj) {
              curr[id][k] = currHistory[id][k];
            }
          }
        } else {
          currHistory[id] = {};
        }
      }
      if (!(fullId in state.selected)) {
        state.selected[fullId] = {};
      }
    } else if (command === "delete") {
      for (let k of Object.keys(curr)) {
        if (k.startsWith(id)) {
          delete curr[k];
        }
      }
    }
  }),

  setSectionIdExParam: action((state, payload) => {
    state.prevSectionIdExParam = state.currSectionIdExParam;
    state.currSectionIdExParam = payload;
    state.sectionIdExParamChanged =
      state.prevSectionIdExParam !== state.currSectionIdExParam;
  }),

  getSectionId: thunk((action, payload, helpers) => {
    const { currName: sectionId } = helpers.getStoreState().globalCurrSection;
    const { currName: moduleName } = helpers.getStoreState().globalCurrModule;
    const { currName: objName } = helpers.getStoreState().globalCurrObj;
    if ([sectionId, moduleName, objName].indexOf(null) === -1) {
      return createId(sectionId, moduleName, objName, payload);
    } else {
      return null;
    }
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    let id = action.getSectionId("");
    if (id !== null) {
      action.setSectionIdExParam(id);
      id += payload;
      action.modifyVisibleSectionIds({
        fullId: id,
        command: "add",
      });
    }
  }),

  deleteCurrFromVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const {
      currName: parentSectionId,
    } = helpers.getStoreState().globalCurrSection;
    let id = action.getSectionId("");
    if (id !== null) {
      action.setSectionIdExParam(id);
      const prev = helpers.getState().prevSectionIdExParam;
      if (
        helpers.getState().sectionIdExParamChanged &&
        prev !== null &&
        !parentSectionId.startsWith(prev) &&
        getTopLevelSectionId(prev) === getTopLevelSectionId(parentSectionId)
      ) {
        action.modifyVisibleSectionIds({
          fullId: prev,
          command: "delete",
        });
      }
    }
  }),

  exportSelected: thunk((action, payload, helpers) => {
    const { globalCurr } = helpers.getStoreState().globalCurrSection;
    const { selected } = helpers.getState();
    let output = createExportableObject(selected, globalCurr);
    output = JSON.stringify(output);
  }),
};

export default master;
