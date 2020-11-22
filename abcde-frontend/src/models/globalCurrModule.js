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
    state.moduleChanged = state.prevModuleName !== state.currModuleName;
    // console.log("prevModuleName", debug(state.prevModuleName));
    // console.log("currModuleName", debug(state.currModuleName));
    // console.log("moduleChanged", debug(state.moduleChanged));
  }),

  // if user has changed modules, update previous module.
  _setGlobalCurrModule: action((state, payload) => {
    if (state.moduleChanged && Object.keys(payload).length > 0) {
      state.globalCurrModule[state.prevModuleName] = payload;
    }
    // console.log("globalCurrModule", debug(state.globalCurrModule));
  }),

  // update globalCurrModule state with latest globalCurrObjs
  setGlobalCurrModuleThunk: thunk((action, payload, helpers) => {
    const { globalCurrObjs } = helpers.getStoreState().globalCurrObj;
    action._setGlobalCurrModule(globalCurrObjs);
  }),

  maybeSetGlobalCurrModuleThunk: thunk((action, payload, helpers) => {
    const { sectionChanged } = helpers.getStoreState().globalCurrSection;
    const { globalCurrObjs } = helpers.getStoreState().globalCurrObj;
    if (sectionChanged) {
      action._setGlobalCurrModule(globalCurrObjs);
    }
  }),

  maybeResetCurrModuleNameThunk: thunk((action, payload, helpers) => {
    const { sectionChanged } = helpers.getStoreState().globalCurrSection;
    if (sectionChanged) {
      action.setCurrModuleName(null);
    }
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
    // console.log("sectionChange", sectionChanged);
    if (sectionChanged) {
      action.initGlobalCurrModule(globalCurrSection[currSectionName]);
    }
  }),
};

export default globalCurrModule;
