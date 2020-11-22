import { action } from "easy-peasy";
import createGlobalCurr from "./globalCurr";

const overrideFunctions = {
  setGlobalCurr: action((state, payload) => {
    const { name, value } = payload;
    state.globalCurr[name] = value;
  }),
};

const globalCurrParams = createGlobalCurr({
  parentName: "globalCurrObj",
  overrideFunctions: overrideFunctions,
});

export default globalCurrParams;
