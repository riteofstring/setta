import { action, thunk } from "easy-peasy";

const globalCurrParams = {
  globalCurrParams: {},

  //actions
  // sets current paramters
  setGlobalCurrParams: action((state, payload) => {
    const { name, value } = payload;
    // console.log("setting ", name, value)
    state.globalCurrParams[name] = value;
    // console.log("globalCurrParams", debug(state.globalCurrParams));
  }),

  // called when user switches to a different module.
  // if there is info in the module, it will assign it to globalCurrParams.
  initGlobalCurrParams: action((state, payload) => {
    if (payload) {
      state.globalCurrParams = payload;
    } else {
      state.globalCurrParams = {};
    }
    // console.log("initializing GlobalCurrParams", debug(state.globalCurrParams));
  }),

  // called on click, but only executes if objChanged is true.
  // gets state from globalCurrObj
  maybeInitGlobalCurrParamsThunk: thunk((action, payload, helpers) => {
    const {
      currObjName,
      objChanged,
      globalCurrObjs,
    } = helpers.getStoreState().globalCurrObj;
    // console.log("objChanged", objChanged)
    if (objChanged) {
      action.initGlobalCurrParams(globalCurrObjs[currObjName]);
    }
  }),
};

export default globalCurrParams;
