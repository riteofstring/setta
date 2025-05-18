import C from "constants/constants.json";
import { useProjectState } from "state/definitions";
import { findAllParametersAndPathMaps } from "utils/getDescendants";
import { createNewId } from "utils/idNameCreation";
import {
  addCodeInfo,
  deleteCodeInfo,
  newCodeInfoMaybeWithJsonSource,
} from "./codeInfo";
import { getCodeInfoCol, getSectionVariant } from "./sectionInfos";
import { maybeIncrementProjectStateVersion } from "./undo";

/**
 * Add parameters to a section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The section to add parameters to.
 * @param {Array<string>} names The names of the newly created parameters.
 * @param {ID} [codeInfoId] The id of the callable to add parameters to. If not specified, then parameters will be added to the "empty" state of the section, i.e. the section when its callable field is set to null.
 * @returns {Array<ID>} the created parameter ids.
 */
export function addParametersMcp({ sectionId, names, codeInfoId }) {
  let ids = [];
  useProjectState.setState((state) => {
    for (const name of names) {
      ids.push(addKwarg({ sectionId, name, parentId: codeInfoId, state }));
    }
  });
  maybeIncrementProjectStateVersion(true);
  return ids;
}

export function addKwarg({
  sectionId,
  name = "",
  parentId = null,
  insertIdx = null,
  state,
}) {
  const kwargInfo = newCodeInfoMaybeWithJsonSource(
    { id: createNewId(), name, rcType: C.PARAMETER, editable: true },
    sectionId,
    state,
  );
  addCodeInfo({
    sectionId,
    info: kwargInfo,
    parent: parentId,
    insertIdx,
    state,
  });
  return kwargInfo.id;
}

export function deleteLastKwarg({ sectionId, parentId = null, state }) {
  const kwargIds = getKwargIds(sectionId, parentId, state);
  const numKwargs = kwargIds.length;
  if (numKwargs === 0) {
    return;
  }
  const kwargId = kwargIds[numKwargs - 1];
  deleteCodeInfo(sectionId, [kwargId], state);
}

export function deleteSelectedKwargs(sectionId) {
  useProjectState.setState((x) => {
    const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, x);
    deleteCodeInfo(sectionId, selectedParamIds, x);
  });
}

export function saveKwargsAsCollection({ sectionId, name }) {
  // // TODO: update this because children are no longer stored in codeInfo
  // const { ids: children } = getParamIds(sectionId);
  // const collection = newCodeInfo({
  //   name,
  //   rcType: C.COLLECTION,
  // });
  // dbSaveCodeInfo({
  //   codeInfo: { [collection.id]: collection },
  // });
}

export function pinSelectedKwargs(sectionId) {
  useProjectState.setState((x) => {
    const { ids: selectedParamIds } = getAllSelectedParamIds(sectionId, x);
    for (const p of selectedParamIds) {
      x.codeInfo[p].isPinned = !x.codeInfo[p].isPinned;
      x.codeInfo[p].isSelected = false;
    }
  });
}

export function toggleParamSelected(sectionId, paramInfoId) {
  useProjectState.setState((x) => {
    const codeInfoChildren = getCodeInfoCol(sectionId, x).children;
    setAttrOfSelfAndDescendants(
      x.codeInfo,
      codeInfoChildren,
      paramInfoId,
      "isSelected",
      !x.codeInfo[paramInfoId].isSelected,
    );
  });
}

export function unselectAllParams() {
  let didUnselectSomeParams = false;
  useProjectState.setState((x) => {
    for (const codeInfo of Object.values(x.codeInfo)) {
      if (codeInfo.isSelected) {
        codeInfo.isSelected = false;
        didUnselectSomeParams = true;
      }
    }
  });
  return didUnselectSomeParams;
}

function setAttrOfSelfAndDescendants(state, codeInfoChildren, id, attr, value) {
  state[id][attr] = value;
  for (const paramId of codeInfoChildren[id]) {
    state[paramId][attr] = value;
    setAttrOfSelfAndDescendants(state, codeInfoChildren, paramId, attr, value);
  }
}

function getKwargIds(sectionId, codeInfoId, _state) {
  const state = _state ?? useProjectState.getState();
  const codeInfoChildren = getCodeInfoCol(sectionId, state).children;
  return codeInfoChildren[codeInfoId].filter((x) => state.codeInfo[x].editable);
}

export function getAllSelectedParamIds(sectionId, state) {
  const codeInfoState = state.codeInfo;
  const { selectedItem } = getSectionVariant(sectionId, state);
  const codeInfoChildren = getCodeInfoCol(sectionId, state).children;
  const { ids, pathMap } = findAllParametersAndPathMaps({
    allCodeInfo: codeInfoState,
    codeInfoChildren,
    startingId: selectedItem,
    additionalOutputCondition: (c) => c?.isSelected,
  });
  return { ids, pathMap };
}
