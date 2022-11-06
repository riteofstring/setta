import { KwargInfo } from "classes/mutableInfo";
import { thunk } from "easy-peasy";
import { createNewId, maybeUseNullId } from "utils/utils";
import { getParamChildId } from "./paramInfos";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

export const addKwarg = thunk((actions, payload, helpers) => {
  const { sectionId, objInfoId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { kwargColId } = getSectionConfig(s, sectionId);
  const kwargInfo = new KwargInfo({
    id: createNewId(),
    name: "",
    rcType: "parameter",
  });
  a.codeInfo.setCodeInfo({ id: kwargInfo.id, info: kwargInfo });
  a.objInfos.setKwargIds({
    collectionId: kwargColId,
    objInfoId: maybeUseNullId(objInfoId),
    newStateFn: (x) => [...x, kwargInfo.id],
  });
});

export const deleteKwarg = thunk((actions, payload, helpers) => {
  const { sectionId, objInfoId, kwargId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { evColId, kwargColId } = getSectionConfig(s, sectionId);
  const { uiTypeColId } = getSectionTypeConfig(s, sectionId);
  const childId = getParamChildId(s, sectionId, kwargId);
  a.objInfos.setKwargIds({
    collectionId: kwargColId,
    objInfoId: maybeUseNullId(objInfoId),
    newStateFn: (x) => x.filter((y) => y !== kwargId),
  });
  a.codeInfo.deleteInfos({ ids: [kwargId] });
  a.paramInfos.deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
  if (childId) {
    a.thunks.deleteChild({ sectionId, startId: childId });
  }
});
