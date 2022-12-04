import { CodeInfo } from "classes/immutableInfo";
import { KwargInfo } from "classes/mutableInfo";
import { thunk } from "easy-peasy";
import _ from "lodash";
import { maybeUseNullId } from "utils/utils";
import { getParamChildId } from "./paramInfos";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

export const addKwarg = thunk((actions, payload, helpers) => {
  const { sectionId, objInfoId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { kwargColId } = getSectionConfig(s, sectionId);
  const kwargInfo = new KwargInfo({
    name: "",
    rcType: "parameter",
  });
  a.codeInfo.setCodeInfo({ info: kwargInfo });
  a.objInfos.setKwargIds({
    collectionId: kwargColId,
    objInfoId: maybeUseNullId(objInfoId),
    newStateFn: (x) => [...x, kwargInfo.id],
  });
});

export const deleteKwarg = thunk((actions, payload, helpers) => {
  let { sectionId, objInfoId, kwargId, deleteLast } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { evColId, kwargColId } = getSectionConfig(s, sectionId);
  const { uiTypeColId } = getSectionTypeConfig(s, sectionId);
  objInfoId = maybeUseNullId(objInfoId);
  if (deleteLast) {
    const kwargIds = s.objInfos.x[kwargColId]?.[objInfoId];
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  const childId = getParamChildId(s, sectionId, kwargId);
  a.objInfos.setKwargIds({
    collectionId: kwargColId,
    objInfoId,
    newStateFn: (x) => x.filter((y) => y !== kwargId),
  });
  a.codeInfo.deleteInfos({ ids: [kwargId] });
  a.paramInfos.deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
  if (childId) {
    a.thunks.deleteChild({ sectionId, startId: childId });
  }
});

export const saveKwargsAsCollection = thunk((actions, payload, helpers) => {
  const { sectionId, objInfoId, name = "test" } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { kwargColId } = getSectionConfig(s, sectionId);
  const kwargIds = s.objInfos.x[kwargColId]?.[maybeUseNullId(objInfoId)];
  const collection = new CodeInfo({
    name,
    rcType: "collection",
    children: kwargIds,
  });

  // copy kwargInfos and set parentId to collection.id
  const paramInfos = _.keyBy(
    kwargIds.map((x) => ({
      ...s.codeInfo.allCodeInfo[x],
      parentId: collection.id,
    })),
    "id"
  );
  a.codeInfo.updateInfos({ [collection.id]: collection, ...paramInfos });
});
