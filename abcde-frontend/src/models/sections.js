import { action, computed } from "easy-peasy";
import { SimpleHistory } from "../classes/simpleHistory";
import { defaultState } from "../utils/utils";
import _ from "lodash";

const sections = {
  sectionInfo: {},
  enteredValues: new SimpleHistory(3, undefined),
  idsOverview: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.sectionInfo[sectionId] = sectionInfo;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, selected, paramName, value } = payload;
    state.enteredValues.history[sectionId][selected][paramName] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, newStateFn } = payload;
    const currState = defaultState(state.idsOverview[sectionId], []);
    state.idsOverview[sectionId] = newStateFn(currState);
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.sectionInfo = _.omit(state.sectionInfo, sectionIds);
    state.enteredValues = _.omit(state.enteredValues, sectionIds);
    state.idsOverview = _.omit(state.idsOverview, sectionIds);
  }),

  idNames: computed((state) => {
    const names = {};
    for (let k of Object.keys(state.sectionInfo)) {
      names[k] = state.sectionInfo[k].name;
    }
    return names;
  }),
};

export default sections;
