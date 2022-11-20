import { createAllInfo } from "classes/infoFactory";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

// allObjInfo maps from every objInfo key to its objInfo
// allCollections maps from every collection key to its objInfo
// callables maps from every collection key to a list of objInfo that are callables
function getInitialState() {
  return {
    allObjInfo: {},
    allCollections: {},
    callables: {},
    params: {},
    paramCollections: {},
  };
}

const codeInfo = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    ({
      allObjInfo: state.allObjInfo,
      allCollections: state.allCollections,
      callables: state.callables,
      params: state.params,
      paramCollections: state.paramCollections,
    } = createAllInfo(payload));
  }),

  setCodeInfo: action((state, payload) => {
    const { info } = payload;
    state.allObjInfo[info.id] = info;
  }),

  setName: action((state, payload) => {
    const { id, name } = payload;
    state.allObjInfo[id].name = name;
  }),

  deleteInfos: action((state, payload) => {
    const { ids } = payload;
    state.allObjInfo = _.omit(state.allObjInfo, ids);
  }),

  updateInfos: action((state, payload) => {
    const allInfo = createAllInfo(payload);
    for (const k of Object.keys(getInitialState())) {
      state[k] = { ...state[k], ...allInfo[k] };
    }
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default codeInfo;
