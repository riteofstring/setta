import { action } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const master = {
  sections: {},
  sectionNames: [],
  selected: {},
  activeObj: "",

  // actions
  // Load DATA
  loadObjects: action((state) => {
    for (let key of Object.keys(Data)) {
      state.sections[key] = new Section(key, Data[key]);
    }
    state.sectionNames = Object.keys(state.sections);
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
    const { sectionName, name, currParams } = payload;
    state.selected[sectionName] = { name, params: currParams };
  }),

  // string name of currently active object
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),
};

export default master;
