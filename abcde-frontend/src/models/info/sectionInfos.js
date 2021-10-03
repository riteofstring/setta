import { action, computed } from "easy-peasy";
import _ from "lodash";

import { defaultState } from "../../utils/utils";

const sectionInfos = {
  x: {},
  idsOverview: {},
  isRendered: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.x[sectionId] = sectionInfo;
  }),

  setObjCollectionIds: action((state, payload) => {
    const { sectionId, objCollectionIds } = payload;
    state.x[sectionId].objCollectionIds = objCollectionIds;
  }),

  setParamCollectionIds: action((state, payload) => {
    const { sectionId, paramCollectionIds } = payload;
    state.x[sectionId].paramCollectionIds = paramCollectionIds;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, newStateFn } = payload;
    const currState = defaultState(state.idsOverview[sectionId], () => []);
    state.idsOverview[sectionId] = newStateFn(currState);
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
};

export default sectionInfos;
