import { action, computed, debug } from "easy-peasy";
import _ from "lodash";

import { defaultState } from "../../utils/utils";
import { exportState } from "./utils";

function setDefault(state, id, attr, val) {
  if (!(id in state[attr])) {
    state[attr][id] = val;
  }
  return state[attr][id];
}

const sectionInfos = {
  x: {},
  idsOverview: {},
  childrenInfo: {},
  isChildRendered: {},

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
    const currState = setDefault(state, childrenInfoId, "childrenInfo", []);
    state.childrenInfo[childrenInfoId] = newStateFn(currState);
  }),

  setIsChildRendered: action((state, payload) => {
    const { sectionId, childId, isRendered, newStateFn } = payload;
    const currState = setDefault(state, sectionId, "isChildRendered", {});
    if (newStateFn) {
      state.isChildRendered[sectionId] = newStateFn(currState);
    } else {
      currState[childId] = isRendered;
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
      (state) => state.idsOverview,
      (state) => state.childrenInfo,
      (state) => state.isChildRendered,
    ],
    computedFromIdsOverview()
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

function computedFromIdsOverview() {
  return (idsOverview, childrenInfo, isChildRendered) => {
    const output = {};
    for (let k of Object.keys(idsOverview)) {
      const childrenInfoId = idsOverview[k];
      const childrenIds = defaultState(childrenInfo[childrenInfoId], () => []);
      output[k] = childrenIds.filter((x) => isChildRendered[k][x]);
    }
    return output;
  };
}
