import { action } from "easy-peasy";
import { setToDefault } from "./utils";

const objInfos = {
  x: {},

  setKwargIds: action((state, payload) => {
    const { collectionId, objInfoId, newStateFn } = payload;
    const currState = setToDefault(state.x, collectionId);
    if (!(objInfoId in currState)) {
      currState[objInfoId] = [];
    }
    currState[objInfoId] = newStateFn(currState[objInfoId]);
  }),

  export() {
    return this.x;
  },
};

export default objInfos;
