import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { ADDED, DELETED, useKwargDelta } from "models/kwargDelta";
import { initializeParam } from "./initializeParam";
import { getParamChildId } from "./paramInfos";
import { deleteChild } from "./sections/deleteChild";
import { getSectionConfig } from "./sections/sections";

export function addKwarg(sectionId: string, objInfoId: string) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargInfo = newCodeInfo({
    name: "",
    rcType: RCType.PARAMETER,
  });
  useCodeInfo.getState().setCodeInfo({ info: kwargInfo });
  useKwargCols.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId: objInfoId,
    newStateFn: (x) => [...x, kwargInfo.id],
  });
  console.log("addKwarg")
  useKwargDelta.getState().setDelta({ sectionId, objInfoId, value: ADDED });
  initializeParam(sectionId, [kwargInfo]);
}

type DeleteKwargPayload = {
  sectionId: string;
  objInfoId: string;
  deleteLast?: boolean;
  kwargId?: string;
};

export function deleteKwarg(payload: DeleteKwargPayload) {
  const { sectionId, objInfoId, deleteLast = false } = payload;
  let { kwargId = "" } = payload;
  const { evColId, kwargColId } = getSectionConfig(sectionId);
  const { uiTypeColId } = getSectionConfig(sectionId);
  if (deleteLast) {
    const kwargIds = useKwargCols.getState().x[kwargColId][objInfoId];
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  const childId = getParamChildId(sectionId, kwargId);
  useKwargCols.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId,
    newStateFn: (x) => x.filter((y) => y !== kwargId),
  });
  useCodeInfo.getState().deleteInfos({ ids: [kwargId] });
  useParamInfos
    .getState()
    .deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
  if (childId) {
    deleteChild({ parentId: sectionId, startId: childId });
  }
  useKwargDelta.getState().setDelta({ sectionId, objInfoId, value: DELETED });
}

export function saveKwargsAsCollection({
  sectionId,
  objInfoId,
  name = "test",
}) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargIds = useKwargCols.getState().x[kwargColId][objInfoId];
  const collection = newCodeInfo({
    name,
    rcType: RCType.COLLECTION,
    children: kwargIds,
  });

  const codeInfoState = useCodeInfo.getState();
  // copy kwargInfos and set parentId to collection.id
  const paramInfos = _.keyBy(
    kwargIds.map((x) => ({
      ...codeInfoState.allCodeInfo[x],
      inCodeParentId: collection.id,
    })),
    "id"
  );

  // TODO fix this call
  // codeInfoState.updateInfos({ [collection.id]: collection, ...paramInfos });
}
