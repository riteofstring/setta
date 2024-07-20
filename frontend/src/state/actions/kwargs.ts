import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import { useEVCols } from "state/definitions/evCols";
import { useSectionToParams } from "state/definitions/sectionToParams";
import { useUITypeCols } from "state/definitions/uiTypeCols";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { getKwargIds } from "../getters/codeInfo";
import {
  getMappedSectionDBSource,
  getSectionInfo,
  getSectionTypeConfig,
} from "../getters/sectionInfo";
import { addCodeInfo, deleteCodeInfo, setCodeInfoName } from "./codeInfo";
import { initializeParam } from "./initializeParam";
import { updateParams } from "./sectionContents";
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
  addCodeInfo({ info: kwargInfo, parent, insertIdx });
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
  deleteCodeInfo({ ids: [kwargId], parent: parentId });
  useEVCols.getState().deleteParamInfo({ dbSource, evColId, ids: [kwargId] });
  useUITypeCols.getState().deleteParamInfo({ uiTypeColId, ids: [kwargId] });
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
  setCodeInfoName({ id: paramInfoId, name });
  updateParams(sectionId);
  maybeIncrementProjectStateVersion(true);
}
