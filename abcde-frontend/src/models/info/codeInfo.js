import { createAllInfo } from "classes/infoFactory";
import { action } from "easy-peasy";

const codeInfo = {
  allObjInfo: {},
  allCollections: {},

  loadObjInfoAndCollections: action((state, payload) => {
    ({ allObjInfo: state.allObjInfo, allCollections: state.allCollections } =
      createAllInfo(payload));
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
};

export default codeInfo;
