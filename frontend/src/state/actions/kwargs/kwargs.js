import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import { useSectionInfos } from "state/definitions";
import { createNewParamId, createRandomName } from "utils/idNameCreation";
import { newCodeInfo } from "utils/objs/codeInfo";
import { getSectionInfo } from "../../getters/sectionInfo";
import { addCodeInfo, deleteCodeInfo } from "../codeInfo";
import { getKwargIds, getSectionCodeInfoChildren } from "../codeInfoCols";
import { initializeParams } from "../initializeParam";
import { deleteParamsFromParamSweep } from "../runGroups/paramSweep";
import { getParamIds } from "../sections/sectionContents";
import { deleteParamInfoFromSectionVariant } from "../sectionVariants";
import { deleteParamInfoFromUITypeCol } from "../uiTypes/uiTypeCols";
import { maybeIncrementProjectStateVersion } from "../undo";
import { getAllSelectedParams } from "./utils";

export function addKwarg({
  sectionId,
  parentId = null,
  name = "",
  insertIdx = null,
  incrementVersion = false,
}) {
  const { jsonSource } = getSectionInfo(sectionId);
  let actualName = name;
  let paramPath = null;
  if (jsonSource) {
    if (!actualName) {
      actualName = createRandomName();
    }
    paramPath = getParamPath(actualName, parentId);
  }
  const kwargInfo = newCodeInfo({
    id: createNewParamId(paramPath, jsonSource),
    name: actualName,
    rcType: C.PARAMETER,
    editable: true,
  });
  useSectionInfos.setState((state) => {
    addCodeInfo({
      sectionId,
      info: kwargInfo,
      parent: parentId,
      insertIdx,
      state,
    });
    initializeParams(sectionId, [kwargInfo.id], state);
  });

  maybeIncrementProjectStateVersion(incrementVersion);
  return kwargInfo.id;
}

export function deleteKwarg(payload) {
  let {
    sectionId,
    parentId = null,
    deleteLast = false,
    incrementVersion = false,
  } = payload;
  let { kwargId = "" } = payload;
  if (deleteLast) {
    const kwargIds = getKwargIds(sectionId, parentId);
    const numKwargs = kwargIds.length;
    if (numKwargs === 0) {
      return;
    }
    kwargId = kwargIds[numKwargs - 1];
  }
  deleteKwargIds({
    sectionId,
    ids: [kwargId],
    incrementVersion,
  });
}

export function deleteSelectedKwargs({ sectionId }) {
  const selectedParams = getAllSelectedParams(sectionId);
  deleteKwargIds({
    sectionId,
    ids: selectedParams.map((x) => x.id),
    incrementVersion: true,
  });
}

function deleteKwargIds({ sectionId, ids, incrementVersion }) {
  useSectionInfos.setState((state) => {
    const { uiTypeColId, variantId } = state.x[sectionId];
    deleteCodeInfo(ids, state);
    deleteParamInfoFromSectionVariant(variantId, ids, state);
    deleteParamInfoFromUITypeCol(uiTypeColId, ids, state);
    deleteParamsFromParamSweep(variantId, ids, state);
  });

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function saveKwargsAsCollection({ sectionId, name }) {
  // TODO: update this because children are no longer stored in codeInfo
  const { ids: children } = getParamIds(sectionId);
  const collection = newCodeInfo({
    name,
    rcType: C.COLLECTION,
  });
  dbSaveCodeInfo({
    codeInfo: { [collection.id]: collection },
  });
}

export function pinSelectedKwargs(sectionId) {
  const selectedParams = getAllSelectedParams(sectionId);
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  console.log("selectedParams", selectedParams);
  useSectionInfos.setState((x) => {
    for (const p of selectedParams) {
      setAttrOfSelfAndDescendants(
        x.codeInfo,
        codeInfoChildren,
        p.id,
        "isPinned",
        !x.codeInfo[p.id].isPinned,
      );
    }
  });
}

export function toggleParamSelected(sectionId, paramInfoId) {
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  useSectionInfos.setState((x) => {
    const newVal = !x.codeInfo[paramInfoId].isSelected;
    console.log("toggleParamSelected", newVal);
    x.codeInfo[paramInfoId].isSelected = newVal;
    // We want only the parent to be true
    // just because of the way other states interpret isSelected
    const childrenNewVal = false;
    setAttrOfSelfAndDescendants(
      x.codeInfo,
      codeInfoChildren,
      paramInfoId,
      "isSelected",
      childrenNewVal,
      false,
    );
  });
}

export function unselectAllParams() {
  useSectionInfos.setState((x) => {
    for (const codeInfo of Object.values(x.codeInfo)) {
      if (codeInfo.isSelected) {
        codeInfo.isSelected = false;
      }
    }
  });
}

function setAttrOfSelfAndDescendants(
  state,
  codeInfoChildren,
  id,
  attr,
  value,
  setSelf = true,
) {
  if (setSelf) {
    state[id][attr] = value;
  }
  for (const paramId of codeInfoChildren[id]) {
    state[paramId][attr] = value;
    setAttrOfSelfAndDescendants(
      state,
      codeInfoChildren,
      paramId,
      attr,
      value,
      true,
    );
  }
}

function getParamPath(name, parentId) {
  const path = [name];
  let id = parentId;
  while (id) {
    const info = getSectionInfo(id);
    if (info.rcType === C.PARAMETER) {
      path.push(info.name);
      id = info.parentId;
    } else {
      break;
    }
  }

  path.reverse();
  return path;
}
