import { dbSaveCodeInfo } from "dbRequests/sectionConfig";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionToParams } from "models/info/sectionToParams";
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

export function saveKwargsAsCollection({ sectionId, name }) {
  const children = useSectionToParams
    .getState()
    .params[sectionId].map((x) => x.id);
  const collection = newCodeInfo({
    name,
    rcType: RCType.COLLECTION,
    children,
  });
  dbSaveCodeInfo({
    codeInfo: { [collection.id]: collection },
  });
}

export function changeKwargName({ sectionId, paramInfoId, name }) {
  useCodeInfo.getState().setName({ id: paramInfoId, name });
  updateParams(sectionId);
  maybeIncrementProjectStateVersion(true);
}
