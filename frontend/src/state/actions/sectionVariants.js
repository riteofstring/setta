import _ from "lodash";
import {
  useSectionInfos,
  useSectionVariants,
  useUITypes,
} from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { getValueForUIType, newEV } from "utils/objs/ev";
import { initValue } from "../utils";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setAllSectionVariants(x) {
  useSectionVariants.setState({ x });
}

export function duplicateSectionVariant({ id, newId, newName }) {
  useSectionVariants.setState((state) => {
    const s = state.x;
    s[newId] = _.cloneDeep(s[id]);
    s[newId].name = newName;
  });
}

export function initManySectionVariantIds({ variantProps }) {
  useSectionVariants.setState((state) => {
    for (const props of variantProps) {
      initValue(state.x, props.id, {
        name: createRandomName(),
        values: props.values ?? {},
        children: props.children ?? [],
        selectedItem: props.selectedItem ?? null,
        code: props.code ?? "",
        codeInfoColId: props.codeInfoColId,
        keywordPositions: props.keywordPositions ?? [],
      });
    }
  });
}
export function initManyEnteredValues({ collectionId, paramIdsToUITypes }) {
  useSectionVariants.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.x[collectionId].values[id] = {
        value: newEV(uiType),
        keywordPositions: [],
      };
    });
  });
}
export function setEnteredValue({ collectionId, paramInfoId, value }) {
  useSectionVariants.setState((state) => {
    state.x[collectionId].values[paramInfoId].value = value;
  });
}

export function setKeywordPositions({
  collectionId,
  paramInfoId,
  keywordPositions,
}) {
  useSectionVariants.setState((state) => {
    state.x[collectionId].values[paramInfoId].keywordPositions =
      keywordPositions;
  });
}

export function deleteParamInfoFromSectionVariant({ variantId, ids }) {
  useSectionVariants.setState((state) => {
    state.x[variantId].values = _.omit(state.x[variantId].values, ids);
  });
}
export function updateSectionVariants({ sectionVariants }) {
  useSectionVariants.setState((state) => {
    state.x = { ...state.x, ...sectionVariants };
  });
}

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}

function getParamEV(sectionId, paramInfoId) {
  const { variantId } = getSectionVariantId(sectionId);
  return useSectionVariants.getState().x[variantId].values[paramInfoId].value;
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const { variantId } = getSectionVariantId(sectionId);
  setEnteredValue({ collectionId: variantId, paramInfoId, value });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setParamEnteredValueBatch({ sectionId, paramInfoIdToValue }) {
  const { variantId } = getSectionVariantId(sectionId);
  useSectionVariants.setState((state) => {
    for (const [id, value] of Object.entries(paramInfoIdToValue)) {
      state.x[variantId].values[id].value = value;
    }
  });
}

export function setParamKeywordPositions({
  sectionId,
  paramInfoId,
  keywordPositions,
}) {
  const { variantId } = getSectionVariantId(sectionId);
  setKeywordPositions({
    collectionId: variantId,
    paramInfoId,
    keywordPositions,
  });
}

export function getSectionChildren(sectionId) {
  const { variantId } = getSectionVariantId(sectionId);
  return useSectionVariants.getState().x[variantId].children;
}

export function getSectionCodeInfoColId(sectionId) {
  const { variantId } = getSectionVariantId(sectionId);
  return useSectionVariants.getState().x[variantId].codeInfoColId;
}

export function getSectionVariantId(sectionId) {
  const { variantId, previewVariantId } =
    useSectionInfos.getState().x[sectionId];
  return { variantId, previewVariantId };
}

export function setSectionVariantChildren({ sectionId, newStateFn }) {
  const { variantId } = getSectionVariantId(sectionId);
  useSectionVariants.setState((state) => {
    state.x[variantId].children = newStateFn(state.x[variantId].children);
  });
}

export function getSectionIdToChildren(sectionVariantState) {
  const output = {};
  const s = useSectionInfos.getState().x;
  for (const [variantId, variantInfo] of Object.entries(sectionVariantState)) {
    const sInfo = _.find(s, (obj) => obj.variantId === variantId);
    if (sInfo) {
      output[sInfo.id] = variantInfo.children;
    }
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
  const { variantId, previewVariantId } = getSectionVariantId(sectionId);
  return useSectionVariants.getState().x[previewVariantId ?? variantId]
    .selectedItem;
}

export function getSectionCode(sectionId) {
  const { variantId, previewVariantId } = getSectionVariantId(sectionId);
  return useSectionVariants.getState().x[previewVariantId ?? variantId].code;
}

export function getSectionChildrenAcrossVariants(sectionId) {
  const section = useSectionInfos.getState().x[sectionId];
  const vState = useSectionVariants.getState().x;
  const output = new Set();
  for (const v of section.variantIds) {
    for (const c of vState[v].children) {
      output.add(c);
    }
  }
  return output;
}

export function setSectionVariantAttr(sectionId, attr, value) {
  const { variantId } = getSectionVariantId(sectionId);
  console.log("setSectionVariantAttr", variantId, attr, value);
  useSectionVariants.setState((x) => {
    x.x[variantId][attr] = value;
  });
}
