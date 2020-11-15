import { action, debug } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const model = {
  sections: [],
  keys: [],
  selected: {},
  activeObj: "",

  //actions
  loadObjects: action((state) => {
    for (var key of Object.keys(Data)) {
      state.sections.push(new Section(key, Data[key]));
      state.keys.push(key);
    }
    state.selected = state.keys.reduce((a, b) => ((a[b] = {}), a), {});
    console.log(state.sections);
  }),
  resetObjects: action((state) => {
    state.objectList = {};
    state.sections = [];
  }),
  setSelected: action((state, payload) => {
    const { theSection, name } = payload;
    state.selected[theSection] = name;
  }),
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),
};

export default model;
