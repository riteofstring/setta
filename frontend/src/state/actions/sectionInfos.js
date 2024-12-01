import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { newEV } from "utils/objs/ev";

export function getSectionInfo(sectionId) {
  return useSectionInfos.getState().x[sectionId];
}

export function getSectionParentId(sectionId) {
  return getSectionInfo(sectionId).parentId;
}

export function getSectionType(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.uiTypes[state.x[sectionId].uiTypeId].type;
}

export function getSectionVariant(sectionId, state) {
  return state.variants[state.x[sectionId].variantId];
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

export function getSectionDescendants(sectionId, state) {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    ids.push(...getSectionVariant(currId, state).children);
    idx += 1;
  }
  return ids;
}

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
  useDndChildren.getState().update(getDisplayedSectionIdToChildren());
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

export function duplicateSectionVariant(id, newName, newCodeInfoColId, state) {
  const newId = createNewId();
  const s = state.variants;
  s[newId] = _.cloneDeep(s[id]);
  s[newId].name = newName;
  s[newId].codeInfoColId = newCodeInfoColId;
  s[newId].isFrozen = false;
  s[newId].isDefault = false;
  return newId;
}

export function initEnteredValue(uiType) {
  return {
    value: newEV(uiType),
    keywordPositions: [],
  };
}

export function initUITypeColEntry(uiTypeId) {
  return {
    uiTypeId,
    nonPresetUITypeIds: [],
  };
}

export function setEnteredValue(variantId, paramInfoId, value, state) {
  state.variants[variantId].values[paramInfoId].value = value;
}

export function setParamEnteredValue(sectionId, paramInfoId, value, state) {
  setEnteredValue(state.x[sectionId].variantId, paramInfoId, value, state);
}

export function getCodeInfoCol(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.codeInfoCols[getSectionVariant(sectionId, state).codeInfoColId];
}

export function getDisplayedCodeInfoCol(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.codeInfoCols[
    getDisplayedSectionVariant(sectionId, state).codeInfoColId
  ];
}

export function getDisplayedSectionVariant(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.variants[getDisplayedSectionVariantId(sectionId, state)];
}

export function getDisplayedSectionVariantId(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.x[sectionId].previewVariantId ?? state.x[sectionId].variantId;
}

export function setSectionVariantChildren(sectionId, newStateFn, state) {
  const variant = getSectionVariant(sectionId, state);
  variant.children = newStateFn(variant.children);
}

export function getDisplayedSectionIdToChildren(state) {
  const output = {};
  const s = state ?? useSectionInfos.getState();
  for (const sectionId of Object.keys(s.x)) {
    output[sectionId] = getDisplayedSectionVariant(sectionId, s).children;
  }
  return output;
}

function getSectionChildrenFromAllVariants(sectionId, state) {
  const output = [];
  for (const v of state.x[sectionId].variantIds) {
    output.push(...state.variants[v].children);
  }
  return output;
}

export function getAllSectionsForDeletionOrCopying(sectionIds, state) {
  const idsToDelete = [...sectionIds];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const idxChildren = getSectionChildrenFromAllVariants(
      idsToDelete[idx],
      state,
    );
    const { paramSweepSectionId } = state.x[idsToDelete[idx]];
    if (idxChildren) {
      idsToDelete.push(...idxChildren);
    }
    if (paramSweepSectionId) {
      idsToDelete.push(paramSweepSectionId);
    }
    idx += 1;
  }
  return idsToDelete;
}

export function setSectionVariantAttr(sectionId, attr, value) {
  const { variantId } = getSectionInfo(sectionId);
  useSectionInfos.setState((x) => {
    x.variants[variantId][attr] = value;
  });
}

export function toggleVariantFrozenState(variantId) {
  useSectionInfos.setState((x) => {
    x.variants[variantId].isFrozen = !x.x[variantId].isFrozen;
  });
}

export function getSelectedVariantIsFrozen(sectionId) {
  const state = useSectionInfos.getState();
  return getSectionVariant(sectionId, state).isFrozen;
}

export function resetSectionsToDefaultVersions(sectionIds) {
  useSectionInfos.setState((x) => {
    const sectionVariants = x.variants;
    let defaultVariantId;
    for (const id of sectionIds) {
      const s = x.x[id];
      if (s.variantIds.length > 1) {
        defaultVariantId = s.variantIds.find(
          (v) => sectionVariants[v].isDefault,
        );
        if (!defaultVariantId) {
          defaultVariantId = s.variantIds[0];
        }
        s.variantId = defaultVariantId;
      }
    }
  });
}

export function resetAllSectionsToDefaultVersions() {
  resetSectionsToDefaultVersions(Object.keys(useSectionInfos.getState().x));
}

export function duplicateCodeInfoCol(id, state) {
  const newId = createNewId();
  const s = state.codeInfoCols;
  s[newId] = _.cloneDeep(s[id]);
  return newId;
}
