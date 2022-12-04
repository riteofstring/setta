import { newCodeInfo } from "classes/immutableInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useObjInfos } from "models/info/objInfos";
import { useParamInfos } from "models/info/paramInfos";
import { maybeUseNullId } from "utils/utils";
import { deleteChild } from "./deleteChild";
import { getParamChildId } from "./paramInfos";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

export function addKwarg({ sectionId, objInfoId }) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargInfo = newCodeInfo({
    name: "",
    rcType: "parameter",
  });
  useCodeInfo.getState().setCodeInfo({ info: kwargInfo });
  useObjInfos.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId: maybeUseNullId(objInfoId),
    newStateFn: (x) => [...x, kwargInfo.id],
  });
}

export function deleteKwarg(payload) {
  let { sectionId, objInfoId, kwargId, deleteLast } = payload;
  const { evColId, kwargColId } = getSectionConfig(sectionId);
  const { uiTypeColId } = getSectionTypeConfig(sectionId);
  objInfoId = maybeUseNullId(objInfoId);
  if (deleteLast) {
    const kwargIds = useObjInfos.getState().x[kwargColId]?.[objInfoId];
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  const childId = getParamChildId(sectionId, kwargId);
  useObjInfos.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId,
    newStateFn: (x) => x.filter((y) => y !== kwargId),
  });
  useCodeInfo.getState().deleteInfos({ ids: [kwargId] });
  useParamInfos
    .getState()
    .deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
  if (childId) {
    deleteChild({ sectionId, startId: childId });
  }
}

export function saveKwargsAsCollection({
  sectionId,
  objInfoId,
  name = "test",
}) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargIds =
    useObjInfos.getState().x[kwargColId]?.[maybeUseNullId(objInfoId)];
  const collection = newCodeInfo({
    name,
    rcType: "collection",
    children: kwargIds,
  });

  const codeInfoState = useCodeInfo.getState();
  // copy kwargInfos and set parentId to collection.id
  const paramInfos = _.keyBy(
    kwargIds.map((x) => ({
      ...codeInfoState.allCodeInfo[x],
      parentId: collection.id,
    })),
    "id"
  );

  // TODO fix this call
  codeInfoState.updateInfos({ [collection.id]: collection, ...paramInfos });
}
