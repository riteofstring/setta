import { action } from "easy-peasy";
import Data from "../data/data.json";
import { Section } from "../utils/jsonParser";
import { debug } from "easy-peasy";

const model = {
  objectList: {},
  sections: [],
  selected: [],

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
  setSelected: action((state, payload) => {
    state.selected.filter((e) =>
      e.name === payload.name ? (e = payload) : ""
    );

    state.selected = [...state.selected, payload];
    console.log(debug(state.selected));
  }),
};

export default model;
