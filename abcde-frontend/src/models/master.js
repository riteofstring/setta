import { action, debug } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const master = {
  sections: {},
  sectionNames: [],
  selected: {},
  globalCurrParams: {},
  activeObj: "",

  //actions
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
  setSelected: action((state, payload) => {
    const { theSectionName, name, currParams } = payload;
    state.selected[theSectionName] = { name, params: currParams };
    // console.log("SELECTED: ", debug(state.selected));
  }),
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),
  setGlobalCurrParams: action((state, payload) => {
    const { name, value } = payload;
    state.globalCurrParams[name] = value;
    console.log("globalCurrParams", debug(state.globalCurrParams));
  }),
};

export default master;
