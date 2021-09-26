import { action, debug } from "easy-peasy";

const uiTypes = {
  uiType: {},

  setUIType: action((state, payload) => {
    state.uiType = payload(state.uiType);
    console.log("setUIType", debug(state.uiType));
  }),
};

export default uiTypes;
