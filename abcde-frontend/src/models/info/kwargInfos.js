import { action, debug } from "easy-peasy";

import { setToDefault, exportState } from "./utils";

function setDefaultInfo(state, sectionId, objInfoId, attr) {
  return setToDefault(state, sectionId, objInfoId, () => ({}), attr);
}

const kwargInfos = {
  x: {},

  setKwargInfo: action((state, payload) => {
    const { sectionId, objInfoId, kwargInfoId, kwargInfo } = payload;
    setDefaultInfo(state, sectionId, objInfoId, "x")[kwargInfoId] = kwargInfo;
    console.log("kwargInfos setKwargInfo", debug(state.x));
  }),

  setName: action((state, payload) => {
    const { sectionId, objInfoId, kwargInfoId, name } = payload;
    console.log("kwargInfos setName", kwargInfoId, debug(state.x));
    setDefaultInfo(state, sectionId, objInfoId, "x")[kwargInfoId].name = name;
  }),

  deleteKwargInfo: action((state, payload) => {
    const { ids } = payload;
    state.x = _.omit(state.x, ids);
  }),

  export() {
    return exportState(this);
  },
};

export default kwargInfos;
