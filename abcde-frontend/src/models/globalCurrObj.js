import { action, debug } from "easy-peasy";

const globalCurrObj = {
  prevObjName: null,
  currObjName: null,
  globalCurrObjs: {},

  //actions

  setCurrObjName: action((state, payload) => {
    state.prevObjName = state.currObjName;
    state.currObjName = payload;
  }),

  setGlobalCurrObj: action((state, payload) => {
    if (state.prevObjName) {
      state.globalCurrObjs[state.prevObjName] = payload;
    }
    console.log("globalCurrObjs", debug(state.globalCurrObjs));
  }),
};

export default globalCurrObj;
