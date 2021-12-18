import { action, computed, debug } from "easy-peasy";
import _ from "lodash";

import { compatibleName } from "../../utils/constants";
import { defaultState } from "../../utils/utils";
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

  setIsRendered: action((state, payload) => {
    const { sectionId, isRendered } = payload;
    if (sectionId) {
      state.x[sectionId].isRendered = isRendered;
    }
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.x = _.omit(state.x, sectionIds);
    state.idsOverview = _.omit(state.idsOverview, sectionIds);
  }),

  idNames: computed((state) => {
    return _.mapValues(state.x, (v) => v.name);
  }),

  allIdsOverview: computed(
    [
      (state) => state.childrenInfo,
      (state) => state.idsOverview,
      (state) => state.x,
    ],
    computedFromIdsOverview((sectionInfos, childrenIds) => childrenIds)
  ),

  hasNested: computed(
    [
      (state) => state.childrenInfo,
      (state) => state.idsOverview,
      (state) => state.x,
    ],
    computedFromIdsOverview((sectionInfos, childrenIds) =>
      childrenIds.map((x) => sectionInfos[x].isRendered).some((x) => x)
    )
  ),

  export() {
    return {
      sectionInfos: exportState(this),
      idsOverview: this.idsOverview,
      childrenInfo: this.childrenInfo,
    };
  },
};

export default sectionInfos;

function computedFromIdsOverview(fn) {
  return (childrenInfo, idsOverview, sectionInfos) => {
    const output = {};
    for (let k of Object.keys(idsOverview)) {
      const childrenInfoId = idsOverview[k];
      const childrenIds = defaultState(childrenInfo[childrenInfoId], () => []);
      output[k] = fn(sectionInfos, childrenIds);
    }
    return output;
  };
}
