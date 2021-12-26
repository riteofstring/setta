import { action } from "easy-peasy";

import { MutableObjInfo } from "../../classes/mutableInfo";
import { setToDefault, exportNestedState } from "./utils";

function setDefaultInfo(state, sectionId, objInfoId) {
  return setToDefault(
    state,
    sectionId,
    objInfoId,
    () => new MutableObjInfo({ id: objInfoId })
  );
}

const objInfos = {
  x: {},

  setKwargIds: action((state, payload) => {
    const { sectionId, objInfoId, newStateFn } = payload;
    const currState = setDefaultInfo(state, sectionId, objInfoId);
    currState.kwargIds = newStateFn(currState.kwargIds);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default objInfos;
