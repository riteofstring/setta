import { action } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const model = {
  sections: {},
  sectionNames: [],
  selected: {},
  activeObj: "",

  //actions
  loadObjects: action((state) => {
    for (var key of Object.keys(Data)) {
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
  setSelected: action((state, payload) => {
    const { theSectionName, name, currParams } = payload;
    state.selected[theSectionName] = { name, params: currParams };
  }),
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),
};

export default model;
