import { action } from "easy-peasy";
import { SimpleHistory } from "../classes/simpleHistory";

const sections = {
  enteredValues: new SimpleHistory(3, undefined),
  idsOverview: {},
  idNames: {},

  setEnteredValue: action((state, payload) => {
    const { sectionId, selected, paramName, value } = payload;
    state.enteredValues.history[sectionId][selected][paramName] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, children } = payload;
    state.idsOverview[sectionId] = children;
  }),

  setIdNames: action((state, payload) => {
    const { sectionId, name } = payload;
    state.idNames[sectionId] = name;
  }),
};

export default sections;
