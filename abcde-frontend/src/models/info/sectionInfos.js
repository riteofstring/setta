import { action, computed } from "easy-peasy";
import _ from "lodash";

import { defaultState } from "../../utils/utils";
import { exportState } from "./utils";

function setDefaultChildrenInfo(state, childrenInfoId) {
  if (!(childrenInfoId in state.childrenInfo)) {
    state.childrenInfo[childrenInfoId] = [];
  }
  return state.childrenInfo[childrenInfoId];
}

function setIsRenderedRecursively(state, id, value) {
  state.x[id].isRendered = value;
  const childIds = state.childrenInfo[state.idsOverview[id]];
  if (childIds) {
    for (let k of childIds) {
      setIsRenderedRecursively(state, k, value);
    }
  }
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

  setIsRendered: action((state, payload) => {
    const { sectionId, value, listOfSectionIds, listOfValues } = payload;
    if (listOfSectionIds) {
      listOfSectionIds.forEach((e, i) =>
        setIsRenderedRecursively(state, e, listOfValues[i])
      );
    } else {
      setIsRenderedRecursively(state, sectionId, value);
    }
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
    computedFromIdsOverview((sectionInfos, childrenIds) =>
      childrenIds.filter((x) => sectionInfos[x].isRendered)
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
