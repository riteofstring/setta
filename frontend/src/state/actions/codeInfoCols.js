import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { createNewId, maybeNewId } from "utils/idNameCreation";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function getSectionCodeInfoChildren(sectionId) {
  return useSectionInfos.getState().codeInfoCols[
    getSectionCodeInfoColId(sectionId)
  ]["children"];
}

export function getCodeInfoChildren(sectionId, codeInfoId) {
  return getSectionCodeInfoChildren(sectionId)[codeInfoId];
}

export function getKwargIds(sectionId, codeInfoId, _cState) {
  const cState = _cState ?? useSectionInfos.getState().codeInfo;
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
