import { action } from "easy-peasy";
import _ from "lodash";

import { exportNestedState } from "./utils";

function setDefaultXId(state, sectionId, key) {
  if (!(sectionId in state[key])) {
    state[key][sectionId] = {};
  }
  return state[key][sectionId];
}

const paramInfos = {
  enteredValues: {},
  childIds: {},
  uiTypeIds: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    setDefaultXId(state, sectionId, "uiTypeIds")[paramInfoId] = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    setDefaultXId(state, sectionId, "enteredValues")[paramInfoId] = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    setDefaultXId(state, sectionId, "childIds")[paramInfoId] = childId;
  }),

  deleteParamInfo: action((state, payload) => {
    // const { sectionId, ids } = payload;
    // state.x = _.omit(state.x[sectionId], ids);
    const { sectionId, ids } = payload;
    for (let stateName of ["enteredValues", "childIds", "uiTypeIds"]) {
      state[stateName][sectionId] = _.omit(state[stateName][sectionId], ids);
    }
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
