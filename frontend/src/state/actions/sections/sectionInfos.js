import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useSectionInfos } from "state/definitions";
import { getSectionIdToChildrenToShow } from "../sectionVariants";

export function toggleSectionOrientation(sectionId) {
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
  sections,
  sectionVariants,
  uiTypes,
  uiTypeCols,
  codeInfo,
  codeInfoCols,
  state,
}) {
  state.x = { ...state.x, ...sections };
  state.variants = { ...state.variants, ...sectionVariants };
  state.uiTypes = { ...state.uiTypes, ...uiTypes };
  state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  state.codeInfo = { ...state.codeInfo, ...codeInfo };
  state.codeInfoCols = { ...state.codeInfoCols, ...codeInfoCols };
}
