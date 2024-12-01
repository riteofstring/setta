import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getSectionIdToChildrenToShow } from "./sectionVariants";

export function getSectionInfo(sectionId) {
  return useSectionInfos.getState().x[sectionId];
}

export function getSectionParentId(sectionId) {
  return getSectionInfo(sectionId).parentId;
}

export function getSectionName(sectionId) {
  return getSectionInfo(sectionId).name;
}

export function getSectionType(sectionId) {
  const sectionTypeId = getSectionInfo(sectionId).uiTypeId;
  return useSectionInfos.getState().uiTypes[sectionTypeId];
}

export function getSectionByName(name) {
  return _.find(useSectionInfos.getState().x, (x) => x.name === name);
}

export function getHighestAncestor(
  sectionId,
  parentIdGetter = getSectionParentId,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getAllSectionChildrenIds(
  sectionIds,
  sectionInfoState,
  sectionVariantState,
) {
  const ids = [...sectionIds];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    ids.push(
      ...sectionVariantState[sectionInfoState[currId].variantId].children,
    );
    idx += 1;
  }
  return ids;
}export function toggleSectionOrientation(sectionId) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].isHorizontalOrientation =
      !state.x[sectionId].isHorizontalOrientation;
  });
}
export function toggleSectionLock(sectionId) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].positionAndSizeLocked =
      !state.x[sectionId].positionAndSizeLocked;
  });
}
export function manualDndChildrenReset() {
  useDndChildren.getState().update(getSectionIdToChildrenToShow());
}
export function setAllPreviewVariantIdsToNull() {
  useSectionInfos.setState((x) => {
    for (const s of Object.values(x.x)) {
      s.previewVariantId = null;
    }
  });
}
export function updateSectionInfos({
  sections, sectionVariants, uiTypes, uiTypeCols, codeInfo, codeInfoCols, state,
}) {
  state.x = { ...state.x, ...sections };
  state.variants = { ...state.variants, ...sectionVariants };
  state.uiTypes = { ...state.uiTypes, ...uiTypes };
  state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  state.codeInfo = { ...state.codeInfo, ...codeInfo };
  state.codeInfoCols = { ...state.codeInfoCols, ...codeInfoCols };
}

