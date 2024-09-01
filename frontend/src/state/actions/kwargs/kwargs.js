import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import {
  useCodeInfo,
  useSectionInfos,
  useSectionToParamIds,
} from "state/definitions";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getKwargIds } from "../../getters/codeInfo";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../../getters/sectionInfo";
import { addCodeInfo, deleteCodeInfo, setCodeInfoName } from "../codeInfo";
import { initializeParam } from "../initializeParam";
import { updateKeywordRegex } from "../keywordRegex";
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
  parentId = parentId ?? getSectionInfo(sectionId).codeInfoId;
  if (deleteLast) {
    const kwargIds = getKwargIds(parentId);
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  deleteKwargIds({
    sectionId,
    ids: [kwargId],
    parent: parentId,
    incrementVersion,
  });
}

export function deleteSelectedKwargs({ sectionId, parentId }) {
  const _parentId = parentId ?? getSectionInfo(sectionId).codeInfoId;
  const cState = useCodeInfo.getState().x;
  const children = cState[_parentId].children;
  const toDelete = [];
  for (const c of children) {
    if (cState[c].isSelected) {
      toDelete.push(c);
    }
  }
  deleteKwargIds({
    sectionId,
    ids: toDelete,
    parent: _parentId,
    incrementVersion: true,
  });
}

function deleteKwargIds({ sectionId, ids, parent, incrementVersion }) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const { variantId } = useSectionInfos.getState().x[sectionId];
  const dbSource = getMappedSectionDBSource(sectionId);

  deleteCodeInfo({ ids, parent });
  deleteParamInfoFromSectionVariant({ dbSource, variantId, ids });
  deleteParamInfoFromUITypeCol({ uiTypeColId, ids });
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
  // maybeIncrementProjectStateVersion(true);
}
