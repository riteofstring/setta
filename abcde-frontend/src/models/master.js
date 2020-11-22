import { action, debug, thunk } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";
import { createId, getSplitId } from "../utils/sectionIds";

const master = {
  sections: {},
  selected: {},
  visibleSectionIds: {},
  activeObj: "",

  // actions
  // Load DATA
  loadObjects: action((state) => {
    for (let key of Object.keys(Data)) {
      state.sections[key] = new Section(key, Data[key]);
    }
    state.selected = Object.keys(state.sections).reduce(
      (acc, curr) => ({ ...acc, [curr]: {} }),
      {}
    );
    state.visibleSectionIds = Object.keys(state.sections).reduce(
      (acc, curr) => ({ ...acc, [curr]: {} }),
      {}
    );
  }),

  resetObjects: action((state) => {
    state.objectList = {};
    state.sections = [];
  }),

  // stores what fields to show
  setSelected: action((state, payload) => {
    const { sectionId, moduleName, name, currParams } = payload;
    state.selected[sectionId] = { moduleName, name, params: currParams };
    // console.log("state.selected", debug(state.selected))
  }),

  // string name of currently active object
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),

  addToVisibleSectionIds: action((state, payload) => {
    const splitId = getSplitId(payload);
    const numParents = splitId.length - 1;
    const id = splitId[numParents];
    let curr = state.visibleSectionIds;
    for (let i = 0; i < numParents; i++) {
      curr = curr[splitId[i]];
    }
    if (!(id in curr)) {
      curr[id] = {};
    }
    if (!(payload in state.selected)) {
      state.selected[payload] = {};
    }
    console.log(
      "ADDING state.visibleSectionIds",
      debug(state.visibleSectionIds)
    );
  }),

  addToVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const { currName: sectionId } = helpers.getStoreState().globalCurrSection;
    const { currName: moduleName } = helpers.getStoreState().globalCurrModule;
    const { currName: objName } = helpers.getStoreState().globalCurrObj;
    const id = createId(sectionId, moduleName, objName, payload);
    action.addToVisibleSectionIds(id);
  }),

  deletePrevFromVisibleSectionIds: action((state, payload) => {
    const splitId = getSplitId(payload);
    const numParents = splitId.length - 1;
    const id = splitId[numParents];
    let curr = state.visibleSectionIds;
    for (let i = 0; i < numParents; i++) {
      curr = curr[splitId[i]];
    }
    for (let k of Object.keys(curr)) {
      if (k.startsWith(id)) {
        delete curr[k];
      }
    }
    console.log(
      "DELETING state.addToVisibleSectionIds",
      debug(state.visibleSectionIds)
    );
  }),

  deletePrevFromVisibleSectionIdsThunk: thunk((action, payload, helpers) => {
    const { currName: sectionId } = helpers.getStoreState().globalCurrSection;
    const { currName: moduleName } = helpers.getStoreState().globalCurrModule;
    const { currName: objName } = helpers.getStoreState().globalCurrObj;
    const id = createId(sectionId, moduleName, objName, "");
    console.log("delete ids starting with", id);
    action.deletePrevFromVisibleSectionIds(id);
  }),
};

export default master;
