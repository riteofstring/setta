import { requiresNestedSection } from "abcde-utils/src/constants";
import { getParamUIType } from "thunks/paramInfos";
import { getCurrObjParamKwargInfos } from "./sectionContents";
import { getSectionInfo, getSectionIsRoot, setCurrChildren } from "./sections";

export function updateManyCurrChildren(sectionIds) {
  sectionIds.forEach((x) => updateCurrChildren(x));
}

export function updateCurrChildren(sectionId) {
  const currChildren = computeCurrChildren(sectionId);
  setCurrChildren({ sectionId, currChildren });
}

function computeCurrChildren(sectionId) {
  const { children } = getSectionInfo(sectionId);
  const allParamInfoIds = children.map((x) => getSectionInfo(x).paramInfoId);
  if (getSectionIsRoot(sectionId)) {
    // keep sections that aren't associated with any parameter
    return children.filter((x, idx) => !allParamInfoIds[idx]);
  }

  // otherwise, keep sections that are associated with current parameters
  const childrenRequiringNesting = getChildrenRequiringNesting(
    sectionId,
    allParamInfoIds
  );
  return children.filter((x, idx) => childrenRequiringNesting[idx]);
}

function getChildrenRequiringNesting(sectionId, allParamInfoIds) {
  const currParamInfoIds = new Set(
    getCurrObjParamKwargInfos(sectionId).map((x) => x.id)
  );
  const isCurr = allParamInfoIds.map((x) => currParamInfoIds.has(x));
  const uiTypes = allParamInfoIds.map((x) => getParamUIType(sectionId, x));
  return uiTypes.map((u, idx) => isCurr[idx] && requiresNestedSection(u.type));
}
