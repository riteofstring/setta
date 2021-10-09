import { action, debug } from "easy-peasy";

const kwargInfos = {
  x: {},

  setKwargInfo: action((state, payload) => {
    const { kwargInfoId, kwargInfo } = payload;
    state.x[kwargInfoId] = kwargInfo;
    console.log("setKwargInfo", debug(state.x));
  }),

  setName: action((state, payload) => {
    const { kwargInfoId, name } = payload;
    state.x[kwargInfoId].name = name;
  }),
};

export default kwargInfos;
