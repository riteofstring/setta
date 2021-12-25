import { action, computed } from "easy-peasy";
import _ from "lodash";

import { exportState } from "./utils";

function setDefaultChildrenInfo(state, childrenInfoId) {
  if (!(childrenInfoId in state.childrenInfo)) {
    state.childrenInfo[childrenInfoId] = [];
  }
  return state.childrenInfo[childrenInfoId];
}

const sectionInfos = {
  x: {},
  idsOverview: {},
  childrenInfo: {},
  currChildren: {},

  setSectionInfo: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionInfoAttr: action((state, payload) => {
    const { sectionId, attr, value } = payload;
    state.x[sectionId][attr] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, childrenInfoId } = payload;
    state.idsOverview[sectionId] = childrenInfoId;
  }),

  setChildrenInfo: action((state, payload) => {
    const { childrenInfoId, newStateFn } = payload;
    const currState = setDefaultChildrenInfo(state, childrenInfoId);
    state.childrenInfo[childrenInfoId] = newStateFn(currState);
  }),

  swapIdsBetweenGroups: action((state, payload) => {
    const { group1, group2, sectionId1, sectionId2 } = payload;
    const idx1 = state.childrenInfo[group1].indexOf(sectionId1);
    const idx2 = state.childrenInfo[group2].indexOf(sectionId2);
    state.childrenInfo[group1][idx1] = sectionId2;
    state.childrenInfo[group2][idx2] = sectionId1;
  }),

  setCurrChildren: action((state, payload) => {
    const { sectionId, currChildren } = payload;
    state.currChildren[sectionId] = currChildren;
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.x = _.omit(state.x, sectionIds);
    state.idsOverview = _.omit(state.idsOverview, sectionIds);
  }),

  idNames: computed([(state) => state.x], (x) => {
    return _.mapValues(x, (v) => v.name);
  }),

  export() {
    return {
      sectionInfos: exportState(this),
      idsOverview: this.idsOverview,
      childrenInfo: this.childrenInfo,
    };
  },
};

export default sectionInfos;
