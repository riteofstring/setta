import { action } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const currentlySelected = {
  currentlySelected: {},

  setCurrentlySelected: action((state, payload) => {
    const { sectionId, moduleName, objName } = payload;
    state.currentlySelected[sectionId] = { moduleName, objName };
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default currentlySelected;
