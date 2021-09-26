import { action } from "easy-peasy";

const objInfos = {
  objInfo: {},
  paramInfoId: {},

  setObjInfo: action((state, payload) => {
    const { objInfoId, objInfo } = payload;
    state.sectionInfo[objInfoId] = objInfo;
  }),
};

export default objInfos;
