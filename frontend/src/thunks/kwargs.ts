import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { RCType } from "z_utils/types/codeInfo";
import { getKwargIds } from "./codeInfo/codeInfo";
import { initializeParam } from "./initializeParam";
import { getSectionInfo, getSectionTypeConfig } from "./sections/getters";
import { updateParams } from "./sections/sectionContents";
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
  const kwargInfo = newCodeInfo({
    name,
    rcType: RCType.PARAMETER,
    editable: true,
  });
  const parent = objInfoId ?? getSectionTypeConfig(sectionId).codeInfoId;
  useCodeInfo.getState().addCodeInfo({ info: kwargInfo, parent });
  initializeParam(sectionId, [kwargInfo]);
  updateParams(sectionId); // TODO: make this not so inefficient
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
  let {
    sectionId,
    objInfoId,
    deleteLast = false,
    incrementVersion = false,
  } = payload;
  let { kwargId = "" } = payload;
  const { evColId } = getSectionInfo(sectionId);
  const { uiTypeColId } = getSectionInfo(sectionId);
  objInfoId = objInfoId ?? getSectionTypeConfig(sectionId).codeInfoId;
  if (deleteLast) {
    const kwargIds = getKwargIds(objInfoId);
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  useCodeInfo.getState().deleteInfo({ id: kwargId, parent: objInfoId });
  useParamInfos
    .getState()
    .deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
  updateParams(sectionId); // TODO: make this not so inefficient
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function saveKwargsAsCollection({ sectionId, objInfoId, name }) {
  //TODO!
  // const { kwargColId } = getSectionInfo(sectionId);
  // const kwargIds = useKwargCols.getState().x[kwargColId][objInfoId];
  // const collection = newCodeInfo({
  //   name,
  //   rcType: RCType.COLLECTION,
  //   children: kwargIds,
  //   path: name,
  // });
  // const codeInfoState = useCodeInfo.getState();
  // const paramInfos = _.keyBy(
  //   kwargIds.map((x) => ({
  //     ...codeInfoState.x[x],
  //     inCodeParentId: collection.id,
  //   })),
  //   "id"
  // );
  // dbSaveCollections({
  //   collections: { [collection.id]: collection, ...paramInfos },
  // });
  // TODO fix this call
  // codeInfoState.updateInfos({ [collection.id]: collection, ...paramInfos });
}

export function changeKwargName({ sectionId, paramInfoId, name }) {
  useCodeInfo.getState().setName({ id: paramInfoId, name });
  updateParams(sectionId);
  maybeIncrementProjectStateVersion(true);
}
