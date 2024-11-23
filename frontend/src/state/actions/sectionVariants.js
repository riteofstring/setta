import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import {
  useSectionInfos,
  useSectionVariants,
  useUITypes,
} from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createNewId, createRandomName } from "utils/idNameCreation";
import { getValueForUIType, newEV } from "utils/objs/ev";
import { initValue } from "../utils";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setAllSectionVariants(x) {
  useSectionVariants.setState({ x });
}

export function duplicateSectionVariant({ id, newName, newCodeInfoColId }) {
  const newId = createNewId();
  useSectionVariants.setState((state) => {
    const s = state.x;
    s[newId] = _.cloneDeep(s[id]);
    s[newId].name = newName;
    s[newId].codeInfoColId = newCodeInfoColId;
    s[newId].isFrozen = false;
    s[newId].isDefault = false;
  });
  return newId;
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
        description: props.newDescription ?? "",
        keywordPositions: props.keywordPositions ?? [],
        isFrozen: props.isFrozen ?? false,
        isDefault: props.isDefault ?? true,
      });
    }
  });
}
export function initManyEnteredValues({ collectionId, paramIdsToUITypes }) {
  useSectionVariants.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.x[collectionId].values[id] = initEnteredValue(uiType);
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
  const { variantId } = getSectionInfo(sectionId);
  return useSectionVariants.getState().x[variantId].values[paramInfoId].value;
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
  const { variantId } = getSectionInfo(sectionId);
  setKeywordPositions({
    collectionId: variantId,
    paramInfoId,
    keywordPositions,
  });
}

export function getSectionChildren(sectionId) {
  const { variantId } = getSectionInfo(sectionId);
  return useSectionVariants.getState().x[variantId].children;
}

export function getSectionChildrenFromAllVariants(sectionId) {
  const output = [];
  for (const v of useSectionInfos.getState().x[sectionId].variantIds) {
    output.push(...useSectionVariants.getState().x[v].children);
  }
  return output;
}

export function getSectionCodeInfoColId(sectionId) {
  return useSectionVariants.getState().x[getSectionVariantIdToShow(sectionId)]
    .codeInfoColId;
}

export function getSectionVariantIdToShow(sectionId) {
  const { variantId, previewVariantId } =
    useSectionInfos.getState().x[sectionId];
  return previewVariantId ?? variantId;
}

export function setSectionVariantChildren({ sectionId, newStateFn }) {
  const { variantId } = getSectionInfo(sectionId);
  let newChildren;
  useSectionVariants.setState((state) => {
    newChildren = newStateFn(state.x[variantId].children);
    state.x[variantId].children = newChildren;
  });
  useDndChildren.getState().updateOneParent(sectionId, newChildren);
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
  return useSectionVariants.getState().x[getSectionVariantIdToShow(sectionId)]
    .selectedItem;
}

export function getSectionCode(sectionId) {
  return useSectionVariants.getState().x[getSectionVariantIdToShow(sectionId)]
    .code;
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
  const { variantId } = getSectionInfo(sectionId);
  console.log("setSectionVariantAttr", variantId, attr, value);
  useSectionVariants.setState((x) => {
    x.x[variantId][attr] = value;
  });
}

export function toggleVariantFrozenState(variantId) {
  useSectionVariants.setState((x) => {
    x.x[variantId].isFrozen = !x.x[variantId].isFrozen;
  });
}

export function getSelectedVariantIsFrozen(sectionId) {
  const variantId = useSectionInfos.getState().x[sectionId].variantId;
  return useSectionVariants.getState().x[variantId].isFrozen;
}

export function resetAllSectionsToDefaultVersions() {
  useSectionInfos.setState((x) => {
    const sectionVariants = useSectionVariants.getState().x;
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
    const sectionVariants = useSectionVariants.getState().x;
    const variantIds = x.x[sectionId].variantIds;
    let defaultVariantId = variantIds.find((v) => sectionVariants[v].isDefault);
    if (defaultVariantId) {
      defaultVariantId = variantIds[0];
    }
    x.x[sectionId].variantId = defaultVariantId;
  });
}
