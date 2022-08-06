import { action } from "easy-peasy";
import { enableMapSet } from "immer";
enableMapSet();

const activeSections = {
  topLevel: new Set(),
  nested: null, // only 1 nested section can be selected at at time

  setNested: action((state, payload) => {
    state.nested = payload;
  }),

  setTopLevel: action((state, payload) => {
    // payload should be a list of section ids
    state.topLevel = new Set(payload);
  }),
};

export default activeSections;
