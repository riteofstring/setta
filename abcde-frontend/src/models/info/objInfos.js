import { action } from "easy-peasy";

import { MutableObjInfo } from "../../classes/mutableInfo";
import { setToDefault, exportNestedState } from "./utils";

function setDefaultInfo(state, collectionId, objInfoId) {
  return setToDefault(
    state,
    collectionId,
    objInfoId,
    () => new MutableObjInfo({ id: objInfoId })
  );
}

const objInfos = {
  x: {},

  setKwargIds: action((state, payload) => {
    const { collectionId, objInfoId, newStateFn } = payload;
    const currState = setDefaultInfo(state, collectionId, objInfoId);
    currState.kwargIds = newStateFn(currState.kwargIds);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default objInfos;
