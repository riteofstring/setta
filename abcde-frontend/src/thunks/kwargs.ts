import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { dbSaveCollections } from "dbRequests/sectionConfig";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { initializeParam } from "./initializeParam";
import { getParamChildId } from "./paramInfos";
import { deleteChild } from "./sections/deleteChild";
import { getSectionInfo } from "./sections/getters";
import { maybeIncrementProjectStateVersion } from "./undo";

type AddKwargPayload = {
  sectionId: string;
  objInfoId: string;
  name?: string;
  incrementVersion?: boolean;
};

export function addKwarg({
  sectionId,
  objInfoId,
  name = "",
  incrementVersion = false,
}: AddKwargPayload) {
  const { kwargColId } = getSectionInfo(sectionId);
  const kwargInfo = newCodeInfo({
    name,
    rcType: RCType.PARAMETER,
  });
  useCodeInfo.getState().setCodeInfo({ info: kwargInfo });
  useKwargCols.getState().setKwargIds({
    collectionId: kwargColId,
    objInfoId: objInfoId,
    newStateFn: (x) => [...x, kwargInfo.id],
  });
  initializeParam(sectionId, [kwargInfo]);
  maybeIncrementProjectStateVersion(incrementVersion);
  return kwargInfo.id;
}

type DeleteKwargPayload = {
  sectionId: string;
  objInfoId: string;
  deleteLast?: boolean;
  kwargId?: string;
  incrementVersion?: boolean;
};

export function deleteKwarg(payload: DeleteKwargPayload) {
  const {
    sectionId,
    objInfoId,
    deleteLast = false,
    incrementVersion = false,
  } = payload;
  let { kwargId = "" } = payload;
  const { evColId, kwargColId } = getSectionInfo(sectionId);
  const { uiTypeColId } = getSectionInfo(sectionId);
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
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function saveKwargsAsCollection({ sectionId, objInfoId, name }) {
  const { kwargColId } = getSectionInfo(sectionId);
  const kwargIds = useKwargCols.getState().x[kwargColId][objInfoId];
  const collection = newCodeInfo({
    name,
    rcType: RCType.COLLECTION,
    children: kwargIds,
    path: name,
  });
  const codeInfoState = useCodeInfo.getState();
  const paramInfos = _.keyBy(
    kwargIds.map((x) => ({
      ...codeInfoState.allCodeInfo[x],
      inCodeParentId: collection.id,
    })),
    "id"
  );

  dbSaveCollections({
    collections: { [collection.id]: collection, ...paramInfos },
  });

  // TODO fix this call
  // codeInfoState.updateInfos({ [collection.id]: collection, ...paramInfos });
}

export function changeKwargName({ id, name }) {
  useCodeInfo.getState().setName({ id, name });
  maybeIncrementProjectStateVersion(true);
}
