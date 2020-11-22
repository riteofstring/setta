import { action, debug, thunk } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";
import { createId } from "../utils/sectionIds"

const master = {
  sections: {},
  selected: {},
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

  addToSelected: action((state, payload) => {
    state.selected[payload] = {}
    console.log("state.selected", debug(state.selected))
  }),

  addToSelectedThunk: thunk((action, payload, helpers) => {
    const { currName: sectionId } = helpers.getStoreState().globalCurrSection;
    const { currName: moduleName } = helpers.getStoreState().globalCurrModule;
    const { currName: objName } = helpers.getStoreState().globalCurrObj;
    const id = createId(sectionId, moduleName, objName, payload);
    action.addToSelected(id)
  }),

  // deleteFromSectionIds: action((state, payload) => {
  //   delete state.sectionIds[payload]
  // }),

};

export default master;
