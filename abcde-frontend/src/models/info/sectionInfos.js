import { action, computed } from "easy-peasy";
import _ from "lodash";

import { compatibleName } from "../../utils/constants";
import { defaultState } from "../../utils/utils";
import { setToDefault, exportState } from "./utils";

function setDefaultIdsOverview(state, sectionId, sectionTypeName) {
  return setToDefault(
    state,
    sectionId,
    sectionTypeName,
    () => [],
    "idsOverview"
  );
}

const sectionInfos = {
  x: {},
  idsOverview: {},

  setSectionInfo: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionInfoAttr: action((state, payload) => {
    const { sectionId, attr, value } = payload;
    state.x[sectionId][attr] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, sectionTypeName, newStateFn } = payload;
    const currState = setDefaultIdsOverview(state, sectionId, sectionTypeName);
    state.idsOverview[sectionId][sectionTypeName] = newStateFn(currState);
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
      (state) => state.hasNested,
      (state) => state.idsOverview,
      (state) => state.x,
      (state, storeState) => storeState.sectionTypes.x,
    ],
    (hasNested, ...otherArgs) => {
      return computedFromIdsOverview(
        (idsOverview, sectionInfos, sectionTypes, typeName, k) =>
          hasNested[k] ? idsOverview[k][typeName] : []
      )(...otherArgs);
    }
  ),

  hasNested: computed(
    [
      (state) => state.idsOverview,
      (state) => state.x,
      (state, storeState) => storeState.sectionTypes.x,
    ],
    computedFromIdsOverview(
      (idsOverview, sectionInfos, sectionTypes, typeName, k) =>
        defaultState(idsOverview[k]?.[typeName], () => [])
          .map((x) => sectionInfos[x].isRendered)
          .some((x) => x)
    )
  ),

  export() {
    return { sectionInfos: exportState(this), idsOverview: this.idsOverview };
  },
};

export default sectionInfos;

function computedFromIdsOverview(fn) {
  return (idsOverview, sectionInfos, sectionTypes) => {
    const output = {};
    for (let k of Object.keys(idsOverview)) {
      const typeName = compatibleName(
        sectionTypes[sectionInfos[k]?.sectionTypeId]?.name
      );
      output[k] = fn(idsOverview, sectionInfos, sectionTypes, typeName, k);
    }
    return output;
  };
}
