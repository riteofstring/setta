import C from "constants/constants.json";
import { dbSaveCodeInfo } from "requests/sectionConfig";
import { useSectionInfos } from "state/definitions";
import { findAllParameters } from "utils/getDescendants";
import { createNewParamId, createRandomName } from "utils/idNameCreation";
import { newCodeInfo } from "utils/objs/codeInfo";
import { addCodeInfo, deleteCodeInfo } from "./codeInfo";
import { getSectionCodeInfoChildren } from "./codeInfoCols";
import { initializeParams } from "./initializeParam";
import { deleteParamsFromParamSweep } from "./runGroups/paramSweep";
import { deleteParamInfoFromSectionVariant } from "./sectionInfos";
import { getParamIds } from "./sections/sectionContents";
import { deleteParamInfoFromUITypeCol } from "./uiTypes/uiTypeCols";

export function addKwarg({
  sectionId,
  parentId = null,
  insertIdx = null,
  state,
}) {
  const { jsonSource } = state.x[sectionId];
  let actualName = name;
  let paramPath = null;
  if (jsonSource) {
    if (!actualName) {
      actualName = createRandomName();
    }
    paramPath = getParamPath(actualName, parentId, state);
  }
  const kwargInfo = newCodeInfo({
    id: createNewParamId(paramPath, jsonSource),
    name: actualName,
    rcType: C.PARAMETER,
    editable: true,
  });
  addCodeInfo({
    sectionId,
    info: kwargInfo,
    parent: parentId,
    insertIdx,
    state,
  });
  initializeParams(sectionId, [kwargInfo.id], state);
  return kwargInfo.id;
}

export function deleteLastKwarg({ sectionId, parentId = null, state }) {
  const kwargIds = getKwargIds(sectionId, parentId, state);
  const numKwargs = kwargIds.length;
  if (numKwargs === 0) {
    return;
  }
  const kwargId = kwargIds[numKwargs - 1];
  deleteKwargIds(sectionId, [kwargId], state);
}

export function deleteSelectedKwargs({ sectionId }) {
  const selectedParams = getAllSelectedParams(sectionId);
  deleteKwargIds({
    sectionId,
    ids: selectedParams.map((x) => x.id),
  });
}

export function deleteKwargIds(sectionId, ids, state) {
  const { uiTypeColId, variantId } = state.x[sectionId];
  deleteCodeInfo(ids, state);
  deleteParamInfoFromSectionVariant(variantId, ids, state);
  deleteParamInfoFromUITypeCol(uiTypeColId, ids, state);
  deleteParamsFromParamSweep(variantId, ids, state);
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

function getKwargIds(sectionId, codeInfoId, _state) {
  const state = _state ?? useSectionInfos.getState();
  const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
  const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
  return codeInfoChildren[codeInfoId].filter((x) => state.codeInfo[x].editable);
}

function getParamPath(name, parentId, state) {
  const path = [name];
  let id = parentId;
  while (id) {
    const info = state.codeInfo[id];
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

export function getAllSelectedParams(sectionId, state) {
  const codeInfoState = state.codeInfo;
  const { codeInfoColId } = state.variants[state.x[sectionId].variantId];
  const codeInfoChildren = state.codeInfoCols[codeInfoColId].children;
  const { ids } = findAllParameters(
    codeInfoState,
    codeInfoChildren,
    codeInfoChildren[null],
  );
  return ids.map((x) => codeInfoState[x]).filter((x) => x.isSelected);
}
