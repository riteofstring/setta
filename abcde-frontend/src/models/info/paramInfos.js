import { action } from "easy-peasy";
import _ from "lodash";

import { setToDefault, exportNestedState } from "./utils";

function setDefaultInfo(state, sectionId, objInfoId, attr) {
  return setToDefault(state, sectionId, objInfoId, () => ({}), attr);
}

const paramInfos = {
  enteredValues: {},
  childIds: {},
  uiTypeIds: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, objInfoId, paramInfoId, uiTypeId } = payload;
    setDefaultInfo(state, sectionId, objInfoId, "uiTypeIds")[paramInfoId] =
      uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, objInfoId, paramInfoId, value } = payload;
    setDefaultInfo(state, sectionId, objInfoId, "enteredValues")[paramInfoId] =
      value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, objInfoId, paramInfoId, childId } = payload;
    setDefaultInfo(state, sectionId, objInfoId, "childIds")[paramInfoId] =
      childId;
  }),

  deleteParamInfo: action((state, payload) => {
    // const { sectionId, ids } = payload;
    // state.x = _.omit(state.x[sectionId], ids);
    const { sectionId, objInfoId, ids } = payload;
    for (let stateName of ["enteredValues", "childIds", "uiTypeIds"]) {
      state[stateName][sectionId][objInfoId] = _.omit(
        state[stateName][sectionId][objInfoId],
        ids
      );
    }
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
