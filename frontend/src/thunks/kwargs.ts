import C from "constants/constants.json";
import { dbSaveCodeInfo } from "dbRequests/sectionConfig";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionToParams } from "models/info/sectionToParams";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { updateParams } from "../state/sectionInfos/actions/sectionContents";
import {
  getMappedSectionDBSource,
  getSectionInfo,
  getSectionTypeConfig,
} from "../state/sectionInfos/getters";
import { getKwargIds } from "./codeInfo/codeInfo";
import { initializeParam } from "./initializeParam";
import { maybeIncrementProjectStateVersion } from "./undo";

type AddKwargPayload = {
  sectionId: string;
  parentId: string;
  name?: string;
  incrementVersion?: boolean;
};

export function addKwarg({
  sectionId,
  parentId,
  name = "",
  insertIdx = null,
  incrementVersion = false,
}: AddKwargPayload) {
  const kwargInfo = newCodeInfo({
    name,
    rcType: C.PARAMETER,
    editable: true,
  });
  const parent = parentId ?? getSectionTypeConfig(sectionId).codeInfoId;
  useCodeInfo.getState().addCodeInfo({ info: kwargInfo, parent, insertIdx });
  initializeParam(sectionId, [kwargInfo]);
  updateParams(sectionId); // TODO: make this not so inefficient
  maybeIncrementProjectStateVersion(incrementVersion);
  return kwargInfo.id;
}

type DeleteKwargPayload = {
  sectionId: string;
  parentId: string;
  deleteLast?: boolean;
  kwargId?: string;
  incrementVersion?: boolean;
};

export function deleteKwarg(payload: DeleteKwargPayload) {
  let {
    sectionId,
    parentId,
    deleteLast = false,
    incrementVersion = false,
  } = payload;
  let { kwargId = "" } = payload;
  const { evColId, uiTypeColId } = getSectionInfo(sectionId);
  const dbSource = getMappedSectionDBSource(sectionId);
  parentId = parentId ?? getSectionTypeConfig(sectionId).codeInfoId;
  if (deleteLast) {
    const kwargIds = getKwargIds(parentId);
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  useCodeInfo.getState().deleteInfo({ ids: [kwargId], parent: parentId });
  useParamInfos
    .getState()
    .deleteParamInfo({ dbSource, evColId, uiTypeColId, ids: [kwargId] });
  updateParams(sectionId); // TODO: make this not so inefficient
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function saveKwargsAsCollection({ sectionId, name }) {
  const children = useSectionToParams
    .getState()
    .params[sectionId].map((x) => x.id);
  const collection = newCodeInfo({
    name,
    rcType: C.COLLECTION,
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
