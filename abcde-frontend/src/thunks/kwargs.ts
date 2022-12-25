import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { maybeUseNullId } from "abcde-utils/src/utils";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { deleteChild } from "./deleteChild";
import { getParamChildId } from "./paramInfos";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

export function addKwarg({ sectionId, objInfoId }) {
  const { kwargColId } = getSectionConfig(sectionId);
  const kwargInfo = newCodeInfo({
    name: "",
    rcType: RCType.PARAMETER,
  });
  useCodeInfo.getState().setCodeInfo({ info: kwargInfo });
  useKwargCols.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId: maybeUseNullId(objInfoId),
    newStateFn: (x) => [...x, kwargInfo.id],
  });
}

export function deleteKwarg(payload) {
  const { sectionId, deleteLast } = payload;
  let { objInfoId, kwargId } = payload;
  const { evColId, kwargColId } = getSectionConfig(sectionId);
  const { uiTypeColId } = getSectionTypeConfig(sectionId);
  objInfoId = maybeUseNullId(objInfoId);
  if (deleteLast) {
    const kwargIds = useKwargCols.getState().x[kwargColId]?.[objInfoId];
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
    useKwargCols.getState().x[kwargColId]?.[maybeUseNullId(objInfoId)];
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
