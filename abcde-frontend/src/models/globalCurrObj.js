import { action, thunk } from "easy-peasy";

const globalCurrObj = {
  prevObjName: null,
  currObjName: null,
  globalCurrObjs: {},

  //actions

  // compare curr/prev objects to determine whether user has changed obj
  setCurrObjName: action((state, payload) => {
    state.prevObjName = state.currObjName;
    state.currObjName = payload;
  }),

  // called onClick to assign params to previous object name
  setGlobalCurrObj: action((state, payload) => {
    if (state.prevObjName) {
      state.globalCurrObjs[state.prevObjName] = payload;
    }
    // console.log("globalCurrObjs", debug(state.globalCurrObjs));
  }),

  // called when user switches to a different module.
  // if there is info in the module, it will assign it to globalCurrObjs.
  initGlobalCurrObjs: action((state, payload) => {
    if (payload) {
      state.globalCurrObjs = payload;
    } else {
      state.globalCurrObjs = {};
    }
    // console.log("initializing GlobalCurrObjs", debug(state.globalCurrObjs));
  }),

  // called on click, but only executes if moduleChanged is true.
  // gets state from globalCurrModules
  maybeInitGlobalCurrObjsThunk: thunk((action, payload, helpers) => {
    const {
      currModuleName,
      moduleChanged,
      globalCurrModule,
    } = helpers.getStoreState().globalCurrModule;
    if (moduleChanged) {
      action.initGlobalCurrObjs(globalCurrModule[currModuleName]);
    }
  }),
};

export default globalCurrObj;
