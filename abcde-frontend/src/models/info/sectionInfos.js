import { action, computed, debug } from "easy-peasy";
import _ from "lodash";

import { compatibleName } from "../../utils/constants";
import {defaultState} from "../../utils/utils"

const sectionInfos = {
  x: {},

  setSectionInfo: action((state, payload) => {
    state.x = payload(state.x);
    console.log("setSectionInfo", debug(state.x))
  }),

  setSectionInfoAttr: action((state, payload) => {
    const { sectionId, attr, value } = payload;
    state.x[sectionId][attr] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, sectionTypeName, newStateFn } = payload;
    const currState = defaultState(
      state.x[sectionId]?.getIdsOverview(sectionTypeName),
      () => []
    );
    console.log("setIdsOverview", sectionId, debug(state.x))
    state.x[sectionId].idsOverview[sectionTypeName] = newStateFn(currState);
    // console.log("setIdsOverview", sectionId, debug(state.x))
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
  }),

  idNames: computed((state) => {
    const names = {};
    for (let k of Object.keys(state.x)) {
      names[k] = state.x[k].name;
    }
    return names;
  }),

  allIdsOverview: computed(
    [(state) => state.x, (state, storeState) => storeState.sectionTypes.x],
    (sectionInfos, sectionTypes) => {
      const output = {};
      for (let k of Object.keys(sectionInfos)) {
        const typeName = compatibleName(
          sectionTypes[sectionInfos[k]?.sectionTypeId]?.name
        );
        output[k] = defaultState(
          sectionInfos[k]?.getIdsOverview(typeName),
          () => []
        );
      }
      return output;
    }
  ),
};

export default sectionInfos;
