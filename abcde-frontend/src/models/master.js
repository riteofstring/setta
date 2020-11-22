import { action, debug } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const master = {
  sections: {},
  sectionNames: [],
  orderAndDepth: [],
  sectionParentNames: [],
  selected: {},
  activeObj: "",

  // actions
  // Load DATA
  loadObjects: action((state) => {
    for (let key of Object.keys(Data)) {
      state.sections[key] = new Section(key, Data[key]);
      state.orderAndDepth.push({name: key, depth: 0})
    }
    state.orderAndDepth[3]["depth"] = 1
    state.orderAndDepth[4]["depth"] = 2 
    console.log(debug(state.orderAndDepth))
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
    const { sectionName, moduleName, name, currParams } = payload;
    state.selected[sectionName] = { moduleName, name, params: currParams };
    // console.log("state.selected", debug(state.selected))
  }),

  // string name of currently active object
  setActiveObj: action((state, payload) => {
    state.activeObj = payload;
  }),

  addNestedSection: action((state, payload) => {
    let depth = 0
    let i = 0
    for (let name of state.sectionParentNames){
      i = state.orderAndDepth.indexOf({name, depth}, i)
      depth += 1
    }
    const name = state.sectionParentNames[depth]
    i += 1
    state.sections[name] = payload
    state.orderAndDepth = [...state.orderAndDepth.slice(0, i), {name, depth}, ...state.orderAndDepth.slice(i)]
  }),
};

export default master;
