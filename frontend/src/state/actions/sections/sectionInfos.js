import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useSectionInfos } from "state/definitions";
import {
  getSectionIdToChildrenToShow,
  setSectionVariantChildren,
} from "../sectionVariants";

export function addSectionInfo(payload) {
  useSectionInfos.setState((state) => ({ x: payload(state.x) }));
}

export function setSectionInfoAttr({
  sectionId,
  sectionIds,
  attr,
  value,
  newValueFn,
}) {
  useSectionInfos.setState((state) => {
    if (sectionIds) {
      sectionIds.forEach((id) => {
        valueOrNewValueFn({
          obj: state.x[id],
          attr,
          value,
          newValueFn,
        });
      });
    } else if (sectionId) {
      valueOrNewValueFn({
        obj: state.x[sectionId],
        attr,
        value,
        newValueFn,
      });
    }
  });
}

export function removeSectionInfos(payload) {
  useSectionInfos.setState((state) => {
    const payloadSet = new Set(payload);
    for (const id of payloadSet) {
      const parentId = state.x[id]?.parentId;
      if (parentId && state.x[parentId]?.variantId) {
        setSectionVariantChildren({
          sectionId: parentId,
          newStateFn: (children) => children.filter((x) => x !== id),
          state,
        });
      }

      let isStillUsedInAVariant = false;
      for (const variantInfo of Object.values(state.variants)) {
        if (variantInfo.children.includes(id)) {
          isStillUsedInAVariant = true;
          break;
        }
      }

      if (!isStillUsedInAVariant) {
        for (const variantId of state.x[id].variantIds) {
          delete state.variants[variantId];
        }
        delete state.x[id];
      }
    }

    for (const [k, v] of Object.entries(state.x)) {
      if (payloadSet.has(v.paramSweepSectionId)) {
        state.x[k].paramSweepSectionId = null;
      }
    }
  });
}

export function setSectionResizeEvent({ sectionId, resizeEvent }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].resizeEvent = resizeEvent;
  });
}

export function toggleSectionOrientation({ sectionId }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].isHorizontalOrientation =
      !state.x[sectionId].isHorizontalOrientation;
  });
}

export function toggleSectionLock({ sectionId }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].positionAndSizeLocked =
      !state.x[sectionId].positionAndSizeLocked;
  });
}

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  } else {
    obj[attr] = value;
  }
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
}) {
  useSectionInfos.setState((state) => {
    _updateSectionInfos({
      sections,
      sectionVariants,
      uiTypes,
      uiTypeCols,
      codeInfo,
      codeInfoCols,
      state,
    });
  });
}

export function _updateSectionInfos({
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
