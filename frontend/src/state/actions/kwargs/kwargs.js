import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import { useSectionInfos, useSectionToParamIds } from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getKwargIds } from "../../getters/codeInfo";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../../getters/sectionInfo";
import { addCodeInfo, deleteCodeInfo, setCodeInfoName } from "../codeInfo";
import { initializeParam } from "../initializeParam";
import { updateKeywordRegex } from "../keywordRegex";
import { updateParams } from "../sections/sectionContents";
import { deleteParamInfoFromSectionVariant } from "../sectionVariants";
import { deleteParamInfoFromUITypeCol } from "../uiTypes/uiTypeCols";
import { maybeIncrementProjectStateVersion } from "../undo";

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
  const parent = parentId ?? getSectionInfo(sectionId).codeInfoId;
  addCodeInfo({ info: kwargInfo, parent, insertIdx });
  initializeParam(sectionId, [kwargInfo.id]);
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
  const { uiTypeColId } = getSectionInfo(sectionId);
  const { variantId } = useSectionInfos.getState().x[sectionId];
  const dbSource = getMappedSectionDBSource(sectionId);
  parentId = parentId ?? getSectionInfo(sectionId).codeInfoId;
  if (deleteLast) {
    const kwargIds = getKwargIds(parentId);
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  deleteCodeInfo({ ids: [kwargId], parent: parentId });
  deleteParamInfoFromSectionVariant({ dbSource, variantId, ids: [kwargId] });
  deleteParamInfoFromUITypeCol({ uiTypeColId, ids: [kwargId] });
  updateParams(sectionId); // TODO: make this not so inefficient
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function saveKwargsAsCollection({ sectionId, name }) {
  const children = useSectionToParamIds.getState().params[sectionId];
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
  console.log("changeKwargName", name);
  setCodeInfoName({ id: paramInfoId, name });
  updateKeywordRegex();
  // updateParams(sectionId);
  // maybeIncrementProjectStateVersion(true);
}
