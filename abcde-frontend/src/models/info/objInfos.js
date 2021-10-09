import { action, debug } from "easy-peasy";

import { MutableObjInfo } from "../../classes/mutableInfo";
import { setToDefault } from "./utils";

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
    console.log("setKwargIds", debug(state.x));
  }),
};

export default objInfos;
