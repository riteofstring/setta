import { action, computed } from "easy-peasy";
import _ from "lodash";

import { defaultState } from "../utils/utils";

const sections = {
  sectionInfoId: {},
  idsOverview: {},
  type: {},

  setSectionInfoId: action((state, payload) => {
    const { sectionId, sectionInfoId } = payload;
    state.sectionInfoId[sectionId] = sectionInfoId;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, newStateFn } = payload;
    const currState = defaultState(state.idsOverview[sectionId], []);
    state.idsOverview[sectionId] = newStateFn(currState);
  }),

  setType: action((state, payload) => {
    const { sectionId, type } = payload;
    state.type[sectionId] = type;
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.sectionInfoId = _.omit(state.sectionInfoId, sectionIds);
    state.idsOverview = _.omit(state.idsOverview, sectionIds);
    state.type = _.omit(state.type, sectionIds);
  }),

  idNames: computed(
    [
      (state) => state.sectionInfoId,
      (state, storeState) => storeState.sectionInfos.sectionInfo,
    ],
    (sectionInfoId, sectionInfo) => {
      const names = {};
      for (let k of Object.keys(sectionInfoId)) {
        names[k] = sectionInfo[sectionInfoId[k]].name;
      }
      return names;
    }
  ),
};

export default sections;
