import { action, thunk } from "easy-peasy";
import { resetState } from "models/utils";
import { setToDefault } from "./utils";

function getInitialState() {
  return { x: {} };
}

const objInfos = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    state.x = payload;
  }),

  setKwargIds: action((state, payload) => {
    const { collectionId, objInfoId, newStateFn } = payload;
    const currState = setToDefault(state.x, collectionId);
    if (!(objInfoId in currState)) {
      currState[objInfoId] = [];
    }
    currState[objInfoId] = newStateFn(currState[objInfoId]);
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default objInfos;
