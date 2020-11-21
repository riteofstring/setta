import { action } from "easy-peasy";

const globalCurrParams = {
  globalCurrParams: {},

  //actions
  // sets current paramters
  setGlobalCurrParams: action((state, payload) => {
    const { name, value } = payload;
    state.globalCurrParams[name] = value;
    // console.log("globalCurrParams", debug(state.globalCurrParams));
  }),
};

export default globalCurrParams;
