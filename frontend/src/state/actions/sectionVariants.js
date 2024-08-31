import _ from "lodash";
import {
  useSectionInfos,
  useSectionVariants,
  useUITypes,
} from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { getValueForUIType, newEV } from "utils/objs/ev";
import { getMappedSectionDBSource } from "../getters/sectionInfo";
import { initValue } from "../utils";
import { debouncedRequestTypeCheck } from "./typeCheck";
import { maybeIncrementProjectStateVersion } from "./undo";
import { varControlUpdate } from "./varControl";

export function setAllSectionVariants(x) {
  useSectionVariants.setState({ x });
}

export function duplicateSectionVariant({ dbSource, id, newId, newName }) {
  useSectionVariants.setState((state) => {
    const dbSlice = state.x[dbSource];
    dbSlice[newId] = _.cloneDeep(dbSlice[id]);
    dbSlice[newId].name = newName;
  });
}
export function duplicateDbSource({ oldDbSource, newDbSource }) {
  useSectionVariants.setState((state) => {
    if (!(newDbSource in state.x)) {
      return;
    }
    const oldDb = state.x[oldDbSource];
    const newDb = state.x[newDbSource];
    for (const variantId of Object.keys(oldDb)) {
      if (!(variantId in newDb)) {
        newDb[variantId] = _.cloneDeep(oldDb[variantId]);
      }
    }
  });
}
export function initManySectionVariantIds({
  dbSource,
  collectionIds,
  variantProps,
}) {
  useSectionVariants.setState((state) => {
    _.forEach(collectionIds, (id) => {
      initValue(state.x, dbSource, {});
      initValue(state.x[dbSource], id, {
        name: createRandomName(),
        values: variantProps.values ?? {},
        children: variantProps.children ?? [],
        selectedItem: variantProps.selectedItem ?? null,
      });
    });
  });
}
export function initManyEnteredValues({
  dbSource,
  collectionId,
  paramIdsToUITypes,
}) {
  useSectionVariants.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.x[dbSource][collectionId].values[id] = {
        value: newEV(uiType),
        keywordPositions: [],
      };
    });
  });
}
export function setEnteredValue({
  dbSource,
  collectionId,
  paramInfoId,
  value,
}) {
  useSectionVariants.setState((state) => {
    state.x[dbSource][collectionId].values[paramInfoId].value = value;
  });
}

export function setKeywordPositions({
  dbSource,
  collectionId,
  paramInfoId,
  keywordPositions,
}) {
  useSectionVariants.setState((state) => {
    state.x[dbSource][collectionId].values[paramInfoId].keywordPositions =
      keywordPositions;
  });
}

export function deleteParamInfoFromSectionVariant({
  dbSource,
  variantId,
  ids,
}) {
  useSectionVariants.setState((state) => {
    state.x[dbSource][variantId].values = _.omit(
      state.x[dbSource][variantId].values,
      ids,
    );
  });
}
export function updateSectionVariants({ sectionVariants }) {
  useSectionVariants.setState((state) => {
    for (const [dbSource, variants] of Object.entries(sectionVariants)) {
      state.x[dbSource] = { ...state.x[dbSource], ...variants };
    }
  });
}

export function convertValue({ sectionId, paramInfoId, uiTypeId }) {
  const uiType = useUITypes.getState().x[uiTypeId];
  const currValue = getParamEV(sectionId, paramInfoId);
  const value = getValueForUIType({ uiType, currValue });
  setParamEnteredValue({ sectionId, paramInfoId, value });
}

function getParamEV(sectionId, paramInfoId) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  return useSectionVariants.getState().x[dbSource][variantId].values[
    paramInfoId
  ];
}

export function setParamEnteredValue({
  sectionId,
  paramInfoId,
  value,
  incrementVersion = false,
}) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  setEnteredValue({ dbSource, collectionId: variantId, paramInfoId, value });
  if (incrementVersion) {
    varControlUpdate();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
  debouncedRequestTypeCheck();
}

export function setParamKeywordPositions({
  sectionId,
  paramInfoId,
  keywordPositions,
}) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  setKeywordPositions({
    dbSource,
    collectionId: variantId,
    paramInfoId,
    keywordPositions,
  });
}

export function getSectionChildren(sectionId) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  return useSectionVariants.getState().x[dbSource][variantId].children;
}

export function getSectionVariantIdAndMappedDBSource(sectionId) {
  const { variantId, previewVariantId } =
    useSectionInfos.getState().x[sectionId];
  const dbSource = getMappedSectionDBSource(sectionId);
  return { variantId, previewVariantId, dbSource };
}

export function setSectionVariantChildren({ sectionId, newStateFn }) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  useSectionVariants.setState((state) => {
    state.x[dbSource][variantId].children = newStateFn(
      state.x[dbSource][variantId].children,
    );
  });
}

export function getSectionIdToChildren(sectionVariantState) {
  const output = {};
  const s = useSectionInfos.getState().x;
  for (const variantsInOneDbSource of Object.values(sectionVariantState)) {
    for (const [variantId, variantInfo] of Object.entries(
      variantsInOneDbSource,
    )) {
      const sInfo = _.find(s, (obj) => obj.variantId === variantId);
      if (sInfo) {
        output[sInfo.id] = variantInfo.children;
      }
    }
  }
  return output;
}

export function getSectionIdParamInfoIdToKeywordPositions(sectionVariantState) {
  const output = {};
  const s = useSectionInfos.getState().x;
  for (const variantsInOneDbSource of Object.values(sectionVariantState)) {
    for (const [variantId, variantInfo] of Object.entries(
      variantsInOneDbSource,
    )) {
      const sInfo = _.find(s, (obj) => obj.variantId === variantId);
      if (sInfo) {
        for (const [paramInfoId, valueInfo] of Object.entries(
          variantInfo.values,
        )) {
          output[`${sInfo.id}-${paramInfoId}`] = valueInfo.keywordPositions;
        }
      }
    }
  }
  return output;
}

export function getSectionSelectedItem(sectionId) {
  const { variantId, previewVariantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  return useSectionVariants.getState().x[dbSource][
    previewVariantId ?? variantId
  ].selectedItem;
}

export function setSectionVariantSelectedItem(sectionId, selectedItem) {
  const { variantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(sectionId);
  useSectionVariants.setState((x) => {
    x.x[dbSource][variantId].selectedItem = selectedItem;
  });
}

export function getSectionChildrenAcrossVariants(sectionId) {
  const section = useSectionInfos.getState().x[sectionId];
  const dbSource = getMappedSectionDBSource(sectionId);
  const vState = useSectionVariants.getState().x[dbSource];
  const output = new Set();
  for (const v of section.variantIds) {
    for (const c of vState[v].children) {
      output.add(c);
    }
  }
  return output;
}
