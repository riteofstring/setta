import { action, thunk } from "easy-peasy";

const createGlobalCurr = ({
  parentName,
  childName,
  overrideFunctions = {},
}) => {
  const maybeUseOverrideFunction = (inputName, defaultFunction) => {
    return overrideFunctions[inputName]
      ? overrideFunctions[inputName]
      : defaultFunction;
  };

  const globalCurr = {
    prevName: null,
    currName: null,
    globalCurr: {},
    nameChanged: false,

    //actions

    // compare curr/prev objects to determine whether user has changed obj
    setCurrName: action((state, payload) => {
      state.prevName = state.currName;
      state.currName = payload;
      state.nameChanged = state.prevName !== state.currName;
    }),

    // called onClick to assign params to previous object name
    setGlobalCurr: maybeUseOverrideFunction(
      "setGlobalCurr",
      action((state, payload) => {
        if (
          state.nameChanged &&
          state.prevName &&
          Object.keys(payload).length > 0
        ) {
          state.globalCurr[state.prevName] = payload;
        }
      })
    ),

    resetGlobalCurr: action((state, payload) => {
      state.globalCurr = {};
    }),

    // update globalCurrModule state with latest globalCurrObjs
    setGlobalCurrThunk: thunk((action, payload, helpers) => {
      const { globalCurr } = helpers.getStoreState()[childName];
      action.setGlobalCurr(globalCurr);
    }),

    maybeSetGlobalCurrThunk: thunk((action, payload, helpers) => {
      const { nameChanged } = helpers.getStoreState().globalCurrSection;
      const { globalCurr } = helpers.getStoreState()[childName];
      if (nameChanged) {
        action.setGlobalCurr(globalCurr);
      }
    }),

    maybeResetCurrNameThunk: thunk((action, payload, helpers) => {
      const { nameChanged } = helpers.getStoreState()[parentName];
      if (nameChanged) {
        action.setCurrName(null);
      }
    }),

    // called when user switches to a different module.
    // if there is info in the module, it will assign it to globalCurrObjs.
    initGlobalCurr: action((state, payload) => {
      if (payload) {
        state.globalCurr = payload;
      } else {
        state.globalCurr = {};
      }
    }),

    // called on click, but only executes if moduleChanged is true.
    // gets state from globalCurrModules
    maybeInitGlobalCurrThunk: thunk((action, payload, helpers) => {
      const { currName, nameChanged, globalCurr } = helpers.getStoreState()[
        parentName
      ];
      if (nameChanged) {
        action.initGlobalCurr(globalCurr[currName]);
      }
    }),
  };

  return globalCurr;
};

export default createGlobalCurr;
