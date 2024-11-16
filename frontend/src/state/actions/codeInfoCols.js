import _ from "lodash";
import { useCodeInfo, useCodeInfoCols } from "state/definitions";
import { createNewId, maybeNewId } from "utils/idNameCreation";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function setAllCodeInfoCols(x) {
  useCodeInfoCols.setState({ x });
}

export function getSectionCodeInfoChildren(sectionId) {
  return useCodeInfoCols.getState().x[getSectionCodeInfoColId(sectionId)][
    "children"
  ];
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
  useCodeInfoCols.setState((x) => {
    sectionIds.forEach((s) => {
      const id = createNewId();
      x.x[id] = newCodeInfoCol(id);
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
  useCodeInfoCols.setState((state) => {
    const s = state.x;
    s[newId] = _.cloneDeep(s[id]);
  });
  return newId;
}
