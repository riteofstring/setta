import { action, debug } from "easy-peasy";

const globalCurrParams = {
  globalCurrParams: {},

  //actions
  setGlobalCurrParams: action((state, payload) => {
    const { name, value } = payload;
    state.globalCurrParams[name] = value;
    console.log("globalCurrParams", debug(state.globalCurrParams));
  }),
};

export default globalCurrParams;
