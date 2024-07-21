import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import { useSectionToParams } from "state/definitions/sectionToParams";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { getKwargIds } from "../getters/codeInfo";
import {
  getMappedSectionDBSource,
  getSectionInfo,
  getSectionTypeConfig,
} from "../getters/sectionInfo";
import { addCodeInfo, deleteCodeInfo, setCodeInfoName } from "./codeInfo";
import { deleteParamInfoFromEVCol } from "./evCols";
import { initializeParam } from "./initializeParam";
import { updateParams } from "./sectionContents";
import { deleteParamInfoFromUITypeCol } from "./uiTypeCols";
import { maybeIncrementProjectStateVersion } from "./undo";

export function addKwarg({
  sectionId,
  parentId,
  name = "",
  insertIdx = null,
  incrementVersion = false,
}) {
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

export function deleteKwarg(payload) {
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
  deleteParamInfoFromEVCol({ dbSource, evColId, ids: [kwargId] });
  deleteParamInfoFromUITypeCol({ uiTypeColId, ids: [kwargId] });
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
