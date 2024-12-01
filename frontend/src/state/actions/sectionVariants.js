import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createNewId } from "utils/idNameCreation";
import { newEV } from "utils/objs/ev";

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

export function deleteParamInfoFromSectionVariant(variantId, ids, state) {
  state.variants[variantId].values = _.omit(
    state.variants[variantId].values,
    ids,
  );
}

export function getParamEV(sectionId, paramInfoId, _state) {
  const state = _state ?? useSectionInfos.getState();
  const { variantId } = state.x[sectionId];
  return state.variants[variantId].values[paramInfoId].value;
}

export function setEnteredValue(variantId, paramInfoId, value, state) {
  state.variants[variantId].values[paramInfoId].value = value;
}

export function setParamEnteredValue(sectionId, paramInfoId, value, state) {
  const { variantId } = state.x[sectionId];
  setEnteredValue(variantId, paramInfoId, value, state);
}

export function getSectionChildren(sectionId) {
  const { variantId } = getSectionInfo(sectionId);
  return useSectionInfos.getState().variants[variantId].children;
}

export function getSectionCodeInfoColId(sectionId) {
  return useSectionInfos.getState().variants[
    getSectionVariantIdToShow(sectionId)
  ].codeInfoColId;
}

export function getSectionVariantToShow(sectionId, state = {}) {
  const id = getSectionVariantIdToShow(sectionId, state);
  return state.variants?.[id] ?? useSectionInfos.getState().variants[id];
}

export function getSectionVariantIdToShow(sectionId, state = {}) {
  const { variantId, previewVariantId } =
    state.x?.[sectionId] ?? useSectionInfos.getState().x[sectionId];
  return previewVariantId ?? variantId;
}

export function setSectionVariantChildren(sectionId, newStateFn, state) {
  const { variantId } = state.x[sectionId];
  state.variants[variantId].children = newStateFn(
    state.variants[variantId].children,
  );
}

export function getSectionIdToChildrenToShow(sectionInfoState) {
  const output = {};
  const s = sectionInfoState ?? useSectionInfos.getState();
  for (const sectionId of Object.keys(s.x)) {
    output[sectionId] =
      s.variants[getSectionVariantIdToShow(sectionId, s)].children;
  }
  return output;
}

export function getSectionIdParamInfoIdToKeywordPositions(sectionVariantState) {
  const output = {};
  const s = useSectionInfos.getState().x;
  for (const [variantId, variantInfo] of Object.entries(sectionVariantState)) {
    const sInfo = _.find(s, (obj) => obj.variantId === variantId);
    if (sInfo) {
      for (const [paramInfoId, valueInfo] of Object.entries(
        variantInfo.values,
      )) {
        output[`${sInfo.id}-${paramInfoId}`] = valueInfo.keywordPositions;
      }
    }
  }
  return output;
}

export function getSectionSelectedItem(sectionId, _state) {
  const state = _state ?? useSectionInfos.getState();
  return state.variants[getSectionVariantIdToShow(sectionId, state)]
    .selectedItem;
}

export function getSectionCode(sectionId) {
  return useSectionInfos.getState().variants[
    getSectionVariantIdToShow(sectionId)
  ].code;
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
  console.log("setSectionVariantAttr", variantId, attr, value);
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
  const variantId = useSectionInfos.getState().x[sectionId].variantId;
  return useSectionInfos.getState().variants[variantId].isFrozen;
}

export function resetAllSectionsToDefaultVersions() {
  useSectionInfos.setState((x) => {
    const sectionVariants = useSectionInfos.getState().variants;
    let defaultVariantId;
    for (const s of Object.values(x.x)) {
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

export function resetSectionToDefaultVersion(sectionId) {
  useSectionInfos.setState((x) => {
    const sectionVariants = useSectionInfos.getState().variants;
    const variantIds = x.x[sectionId].variantIds;
    let defaultVariantId = variantIds.find((v) => sectionVariants[v].isDefault);
    if (defaultVariantId) {
      defaultVariantId = variantIds[0];
    }
    x.x[sectionId].variantId = defaultVariantId;
  });
}
