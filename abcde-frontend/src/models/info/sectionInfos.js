import { action, computed } from "easy-peasy";
import _ from "lodash";

import { compatibleName } from "../../utils/constants";
import { defaultState } from "../../utils/utils";
import { exportState } from "./utils";

function setDefaultIdsOverview(state, sectionId) {
  if (!(sectionId in state.idsOverview)) {
    state.idsOverview[sectionId] = {};
  }
  return state.idsOverview[sectionId];
}

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
    const { sectionId, sectionTypeName, childrenInfoId } = payload;
    const currState = setDefaultIdsOverview(state, sectionId);
    currState[sectionTypeName] = childrenInfoId;
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
    const names = {};
    for (let k of Object.keys(state.x)) {
      names[k] = state.x[k].name;
    }
    return names;
  }),

  allIdsOverview: computed(
    [
      (state) => state.childrenInfo,
      (state) => state.idsOverview,
      (state) => state.x,
      (state, storeState) => storeState.sectionTypes.x,
    ],
    computedFromIdsOverview((sectionInfos, childrenIds) => childrenIds)
  ),

  hasNested: computed(
    [
      (state) => state.childrenInfo,
      (state) => state.idsOverview,
      (state) => state.x,
      (state, storeState) => storeState.sectionTypes.x,
    ],
    computedFromIdsOverview((sectionInfos, childrenIds) =>
      childrenIds.map((x) => sectionInfos[x].isRendered).some((x) => x)
    )
  ),

  export() {
    return { sectionInfos: exportState(this), idsOverview: this.idsOverview };
  },
};

export default sectionInfos;

function computedFromIdsOverview(fn) {
  return (childrenInfo, idsOverview, sectionInfos, sectionTypes) => {
    const output = {};
    for (let k of Object.keys(idsOverview)) {
      const typeName = compatibleName(
        sectionTypes[sectionInfos[k]?.sectionTypeId]?.name
      );
      const childrenInfoId = idsOverview[k]?.[typeName];
      const childrenIds = defaultState(childrenInfo[childrenInfoId], () => []);
      output[k] = fn(sectionInfos, childrenIds);
    }
    return output;
  };
}
