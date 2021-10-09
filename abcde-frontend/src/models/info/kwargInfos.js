import { action } from "easy-peasy";

const kwargInfos = {
  x: {},

  setKwargInfo: action((state, payload) => {
    const { kwargInfoId, kwargInfo } = payload;
    state.x[kwargInfoId] = kwargInfo;
  }),

  setName: action((state, payload) => {
    const { kwargInfoId, name } = payload;
    state.x[kwargInfoId].name = name;
  }),

  deleteKwargInfo: action((state, payload) => {
    const { ids } = payload;
    state.x = _.omit(state.x, ids);
  }),
};

export default kwargInfos;
