import _ from "lodash";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { createNewId, maybeNewId } from "utils/idNameCreation";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function setAllCodeInfoCols(codeInfoCols) {
  useSectionInfos.setState({ codeInfoCols });
}

export function getSectionCodeInfoChildren(sectionId) {
  return useSectionInfos.getState().codeInfoCols[
    getSectionCodeInfoColId(sectionId)
  ]["children"];
}

export function getCodeInfoChildren(sectionId, codeInfoId) {
  return getSectionCodeInfoChildren(sectionId)[codeInfoId];
}

export function getKwargIds(sectionId, codeInfoId, _cState) {
  const cState = _cState ?? useCodeInfo.getState().x;
  return getCodeInfoChildren(sectionId, codeInfoId).filter(
    (x) => cState[x].editable,
  );
}

export function initManyCodeInfoCols(sectionIds) {
  const sectionIdToCodeInfoColId = {};
  useSectionInfos.setState((x) => {
    sectionIds.forEach((s) => {
      const id = createNewId();
      x.codeInfoCols[id] = newCodeInfoCol(id);
      sectionIdToCodeInfoColId[s] = id;
    });
  });
  return sectionIdToCodeInfoColId;
}

function newCodeInfoCol(id) {
  return { id: maybeNewId(id), children: { null: [] } };
}

export function duplicateCodeInfoCol(id) {
  const newId = createNewId();
  useSectionInfos.setState((state) => {
    const s = state.codeInfoCols;
    s[newId] = _.cloneDeep(s[id]);
  });
  return newId;
}

export function addCodeInfoColsBatch(x) {
  useSectionInfos.setState((state) => {
    state.codeInfoCols = { ...state.codeInfoCols, ...x };
  });
}

export function batchUpdateCodeInfoChildren(sectionId, idToNewChildren) {
  useSectionInfos.setState((x) => {
    const { codeInfoColId } = x.variants[x.sectionConfigs[sectionId].variantId];
    for (const [id, newChildren] of Object.entries(idToNewChildren)) {
      x.codeInfoCols[codeInfoColId].children[id] = newChildren;
    }
  });
}
