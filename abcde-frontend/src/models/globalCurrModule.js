import { action, thunk } from "easy-peasy";

const globalCurrModule = {
  prevModuleName: null,
  currModuleName: null,
  moduleChanged: false,
  globalCurrModule: {},

  // actions

  // compare currModuleName to prevModuleName to determine if User has changed modules.
  setCurrModuleName: action((state, payload) => {
    state.prevModuleName = state.currModuleName;
    state.currModuleName = payload;
    state.moduleChanged =
      state.prevModuleName && state.prevModuleName !== state.currModuleName;
    // console.log("globalCurrModule", debug(state.globalCurrModule));
  }),

  // if user has changed modules, update previous module.
  _setGlobalCurrModule: action((state, payload) => {
    if (state.moduleChanged) {
      state.globalCurrModule[state.prevModuleName] = payload;
    }
    // console.log("globalCurrModule", debug(state.globalCurrModule));
  }),

  // update globalCurrModule state with latest globalCurrObjs
  setGlobalCurrModuleThunk: thunk((action, payload, helpers) => {
    const { globalCurrObjs } = helpers.getStoreState().globalCurrObj;
    action._setGlobalCurrModule(globalCurrObjs);
  }),

  // called when user switches to a different module.
  // if there is info in the module, it will assign it to globalCurrObjs.
  initGlobalCurrModule: action((state, payload) => {
    if (payload) {
      state.globalCurrModule = payload;
    } else {
      state.globalCurrModule = {};
    }
    // console.log("initializing GlobalCurrModule", debug(state.globalCurrModule));
  }),

  // called on click, but only executes if moduleChanged is true.
  // gets state from globalCurrModules
  maybeInitGlobalCurrModuleThunk: thunk((action, payload, helpers) => {
    const {
      currSectionName,
      sectionChanged,
      globalCurrSection,
    } = helpers.getStoreState().globalCurrSection;
    if (sectionChanged) {
      action.initGlobalCurrModule(globalCurrSection[currSectionName]);
    }
  }),
};

export default globalCurrModule;
