import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createNewId, createRandomName } from "utils/idNameCreation";
import { getValueForUIType, newEV } from "utils/objs/ev";
import { initValue } from "../utils";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setAllSectionVariants(variants) {
  useSectionInfos.setState({ variants });
}

export function duplicateSectionVariant({ id, newName, newCodeInfoColId }) {
  const newId = createNewId();
  useSectionInfos.setState((state) => {
    const s = state.variants;
    s[newId] = _.cloneDeep(s[id]);
    s[newId].name = newName;
    s[newId].codeInfoColId = newCodeInfoColId;
    s[newId].isFrozen = false;
    s[newId].isDefault = false;
  });
  return newId;
}

export function initManySectionVariantIds({ variantProps }) {
  useSectionInfos.setState((state) => {
    for (const props of variantProps) {
      initValue(state.variants, props.id, {
        name: createRandomName(),
        values: props.values ?? {},
        children: props.children ?? [],
        selectedItem: props.selectedItem ?? null,
        code: props.code ?? "",
        codeInfoColId: props.codeInfoColId,
        description: props.newDescription ?? "",
        keywordPositions: props.keywordPositions ?? [],
        isFrozen: props.isFrozen ?? false,
        isDefault: props.isDefault ?? true,
        sweep: props.sweep ?? [],
      });
    }
  });
}
export function initManyEnteredValues({ collectionId, paramIdsToUITypes }) {
  useSectionInfos.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.variants[collectionId].values[id] = initEnteredValue(uiType);
    });
  });
}

export function initEnteredValue(uiType) {
  return {
    value: newEV(uiType),
    keywordPositions: [],
  };
}

export function setEnteredValue({ collectionId, paramInfoId, value }) {
  useSectionInfos.setState((state) => {
    state.variants[collectionId].values[paramInfoId].value = value;
  });
}

export function setKeywordPositions({
  collectionId,
  paramInfoId,
  keywordPositions,
}) {
  useSectionInfos.setState((state) => {
    state.variants[collectionId].values[paramInfoId].keywordPositions =
      keywordPositions;
  });
}

export function deleteParamInfoFromSectionVariant({ variantId, ids }) {
  useSectionInfos.setState((state) => {
    state.variants[variantId].values = _.omit(
      state.variants[variantId].values,
      ids,
    );
  });
}
export function updateSectionVariants({ sectionVariants }) {
  useSectionInfos.setState((state) => {
    state.variants = { ...state.variants, ...sectionVariants };
  });
}

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useSectionInfos.getState().uiTypes[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}

function getParamEV(sectionId, paramInfoId) {
  const { variantId } = getSectionInfo(sectionId);
  return useSectionInfos.getState().variants[variantId].values[paramInfoId]
    .value;
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const { variantId } = getSectionInfo(sectionId);
  setEnteredValue({ collectionId: variantId, paramInfoId, value });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setParamEnteredValueBatch({ sectionId, paramInfoIdToValue }) {
  const { variantId } = getSectionInfo(sectionId);
  useSectionInfos.setState((state) => {
    for (const [id, value] of Object.entries(paramInfoIdToValue)) {
      state.variants[variantId].values[id].value = value;
    }
  });
}

export function setParamKeywordPositions({
  sectionId,
  paramInfoId,
  keywordPositions,
}) {
  const { variantId } = getSectionInfo(sectionId);
  setKeywordPositions({
    collectionId: variantId,
    paramInfoId,
    keywordPositions,
  });
}

export function getSectionChildren(sectionId) {
  const { variantId } = getSectionInfo(sectionId);
  return useSectionInfos.getState().variants[variantId].children;
}

export function getSectionChildrenFromAllVariants(sectionId) {
  const output = [];
  for (const v of useSectionInfos.getState().x[sectionId].variantIds) {
    output.push(...useSectionInfos.getState().variants[v].children);
  }
  return output;
}

export function getSectionCodeInfoColId(sectionId) {
  return useSectionInfos.getState().variants[
    getSectionVariantIdToShow(sectionId)
  ].codeInfoColId;
}

export function getSectionVariantIdToShow(sectionId, state = {}) {
  const { variantId, previewVariantId } =
    state.x?.[sectionId] ?? useSectionInfos.getState().x[sectionId];
  return previewVariantId ?? variantId;
}

export function setSectionVariantChildren({ sectionId, newStateFn, state }) {
  function fn(state) {
    const { variantId } = state.x[sectionId];
    state.variants[variantId].children = newStateFn(
      state.variants[variantId].children,
    );
  }

  if (state) {
    fn(state);
  } else {
    useSectionInfos.setState(fn);
  }
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

export function getSectionSelectedItem(sectionId) {
  return useSectionInfos.getState().variants[
    getSectionVariantIdToShow(sectionId)
  ].selectedItem;
}

export function getSectionCode(sectionId) {
  return useSectionInfos.getState().variants[
    getSectionVariantIdToShow(sectionId)
  ].code;
}

export function getSectionChildrenAcrossVariants(sectionId) {
  const section = useSectionInfos.getState().x[sectionId];
  const vState = useSectionInfos.getState().variants;
  const output = new Set();
  for (const v of section.variantIds) {
    for (const c of vState[v].children) {
      output.add(c);
    }
  }
  return output;
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
