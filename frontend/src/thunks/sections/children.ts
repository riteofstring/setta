import { useSectionInfos } from "models/info/sectionInfos";
import { getParamUIType } from "thunks/paramInfos";
import { requiresNestedSection } from "z_utils/constants";
import { getSectionInfo, getSectionIsRoot, getSectionType } from "./getters";
import { getParamInfos } from "./sectionContents";

export function updateManyCurrChildren(sectionIds) {
  sectionIds.forEach((x) => updateCurrChildren(x));
}

export function updateCurrChildren(sectionId) {
  const currChildren = computeCurrChildren(sectionId);
  const sectionInfosState = useSectionInfos.getState();
  sectionInfosState.setCurrChildren({ sectionId, currChildren });
  const sectionType = getSectionType(sectionId);
  sectionInfosState.setCurrChildrenNames({ currChildren, sectionType });
}

export function setAllChildren(sectionId, newStateFn) {
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn,
  });
  updateCurrChildren(sectionId);
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
  const currParamInfoIds = new Set(getParamInfos(sectionId).map((x) => x.id));
  const isCurr = allParamInfoIds.map((x) => currParamInfoIds.has(x));
  const uiTypes = allParamInfoIds.map((x) =>
    x ? getParamUIType(sectionId, x) : {}
  );
  return uiTypes.map((u, idx) => isCurr[idx] && requiresNestedSection(u.type));
}
