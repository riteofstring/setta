import { action, computed } from "easy-peasy";
import _ from "lodash";

import { compatibleName } from "../../utils/constants";
import { defaultState } from "../../utils/utils";
import { setToDefault } from "./utils";

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
  isRendered: {},

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
    state.isRendered = payload(state.isRendered);
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    state.x = _.omit(state.x, sectionIds);
    state.idsOverview = _.omit(state.idsOverview, sectionIds);
    state.isRendered = _.omit(state.isRendered, sectionIds);
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
      (state) => state.idsOverview,
      (state) => state.x,
      (state, storeState) => storeState.sectionTypes.x,
    ],
    (idsOverview, sectionInfos, sectionTypes) => {
      const output = {};
      for (let k of Object.keys(idsOverview)) {
        const typeName = compatibleName(
          sectionTypes[sectionInfos[k]?.sectionTypeId]?.name
        );
        output[k] = defaultState(idsOverview[k]?.[typeName], () => []);
      }
      return output;
    }
  ),
};

export default sectionInfos;
