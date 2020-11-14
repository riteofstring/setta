import { action } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";

const model = {
  objectList: {},
  sections: [],

  //actions
  loadObjects: action((state) => {
    state.objectList = Data;
    for (var key of Object.keys(state.objectList)) {
      state.sections.push(new Section(key, state.objectList[key]));
    }
  }),
  resetObjects: action((state) => {
    state.objectList = {};
    state.sections = [];
  }),
};

export default model;
