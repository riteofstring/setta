import { createAllInfo } from "classes/infoFactory";
import { action } from "easy-peasy";
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

  loadObjInfoAndCollections: action((state, payload) => {
    ({
      allObjInfo: state.allObjInfo,
      allCollections: state.allCollections,
      callables: state.callables,
      params: state.params,
      paramCollections: state.paramCollections,
    } = createAllInfo(payload));
  }),

  setCodeInfo: action((state, payload) => {
    const { id, info } = payload;
    state.allObjInfo[id] = info;
  }),

  setName: action((state, payload) => {
    const { id, name } = payload;
    state.allObjInfo[id].name = name;
  }),

  deleteInfos: action((state, payload) => {
    const { ids } = payload;
    state.allObjInfo = _.omit(state.allObjInfo, ids);
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default codeInfo;
