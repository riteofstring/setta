import { action } from "easy-peasy";
import { SimpleHistory } from "../classes/simpleHistory";
import _ from "lodash"

const sections = {
  sectionInfo: {},
  enteredValues: new SimpleHistory(3, undefined),
  idsOverview: {},
  idNames: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.sectionInfo[sectionId] = sectionInfo;
  }),

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

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.sectionInfo = _.omit(state.sectionInfo, sectionIds)
    state.enteredValues = _.omit(state.enteredValues, sectionIds)
    state.idsOverview = _.omit(state.idsOverview, sectionIds)
    // delete state.sectionInfo[sectionId];
    // delete state.enteredValues[sectionId];
    // delete state.idsOverview[sectionId];
  }),
};

export default sections;
